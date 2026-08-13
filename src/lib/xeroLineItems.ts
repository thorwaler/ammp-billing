import { isElumPackage, elumPackageLabel } from "@/data/pricingData";

/**
 * Shared Xero line-item builders.
 *
 * The single-contract calculator (`InvoiceCalculator`) and the merged-invoice
 * dialog (`MergedInvoiceDialog`) produced byte-identical line descriptions for
 * every package-specific pricing model, differing only in a `[Contract]`
 * prefix. Both now call these builders so a pricing wording change lands in one
 * place.
 */

export interface XeroLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode: string;
}

export interface SharedLineItemOptions {
  /** Calculation result from `calculateInvoice` */
  result: any;
  packageType: string;
  currencySymbol: string;
  /** Platform Fees account code (ARR), usually "1002" */
  accountCode: string;
  /** Prefix such as `[Contract name] ` used by merged invoices */
  prefix?: string;
  /** Contract MW, used for the per-MW overage description and Elum fallback scope */
  mwManaged?: number;
}

/**
 * Package-specific recurring platform lines: per-MW annual upfront, SPS annual
 * upfront, Elum org tiers, hybrid tiered, Elum Internal / ePM / Jubaili, and
 * the collapsed Elum summary line.
 *
 * NOT included (they differ between the two callers): base pricing, module
 * costs, site-minimum threshold splits, addons, retainers and one-time fees.
 */
export function buildPackageLineItems(options: SharedLineItemOptions): XeroLineItem[] {
  const { result, packageType, currencySymbol, accountCode, prefix = '', mwManaged } = options;
  const items: XeroLineItem[] = [];
  const isElumSummary = isElumPackage(packageType);
  const push = (Description: string, UnitAmount: number) =>
    items.push({ Description: `${prefix}${Description}`, Quantity: 1, UnitAmount, AccountCode: accountCode });

  // Per-MW + Annual Upfront Minimum: floor line, or quarterly overage line
  const b = result.perMWAnnualUpfrontBreakdown;
  if (b) {
    const rateDisplay = `${currencySymbol}${b.perMWpRate.toLocaleString()}/MW`;
    if (b.cycleType === 'annual_upfront') {
      const syncedMW = b.syncedMW || 0;
      const fixedMin = b.fixedAnnualMinimum || 0;
      push(
        `Annual Platform Fee — Minimum (max of synced ${syncedMW.toFixed(2)} MW × ${rateDisplay} = ${currencySymbol}${b.mwBasedFloor.toLocaleString()} and fixed minimum ${currencySymbol}${fixedMin.toLocaleString()})`,
        b.annualFloor,
      );
    } else if (b.overageAmount > 0) {
      const mwNote = mwManaged != null ? `${Number(mwManaged).toFixed(2)} MW × ${rateDisplay}, ` : `${rateDisplay}, `;
      push(`Per-MW Quarterly Overage (${mwNote}YTD adjustment above annual minimum)`, b.overageAmount);
    }
  }

  // SPS Monitoring: annual upfront charge, or quarterly prepaid-balance credit
  const sb = result.spsAnnualUpfrontBreakdown;
  if (sb) {
    if (sb.cycleType === 'annual_upfront') {
      push(
        sb.annualUpfrontAmount > sb.annualDiscountedFee
          ? `Annual Platform Fee — Minimum (Minimum Annual Contract Value ${currencySymbol}${sb.annualMinimum.toLocaleString()} exceeds discounted annual SPS value ${currencySymbol}${sb.annualDiscountedFee.toLocaleString()})`
          : `Annual Platform Fee — Full Annual SPS Value (${currencySymbol}${sb.annualDiscountedFee.toLocaleString()} exceeds minimum ${currencySymbol}${sb.annualMinimum.toLocaleString()})`,
        sb.annualUpfrontAmount,
      );
    } else if (sb.creditApplied > 0) {
      push(
        `Annual Minimum Already Paid — credit applied from prepaid balance (remaining after this invoice: ${currencySymbol}${sb.prepaidBalanceAfter.toLocaleString()})`,
        -sb.creditApplied,
      );
    }
  }

  // Elum 2026 org-based tiers: one combined line per sub-organisation
  const ob = result.elumOrgTierBreakdown;
  if (!isElumSummary && ob) {
    ob.orgs.forEach((org: any) => {
      if (org.totalCost > 0) {
        const rateNote = org.appliedRate != null
          ? ` @ ${currencySymbol}${org.appliedRate}/MWp/yr${org.appliedTierLabel ? ` (${org.appliedTierLabel})` : ''}`
          : ' (per-site size buckets)';
        const econfNote = org.econfCost > 0 ? ` + Remote eConf @ ${currencySymbol}${org.econfRate}/MWp/yr` : '';
        push(
          `${ob.tierLabel} — ${org.orgName} (${org.siteCount} sites, ${org.totalMWp.toFixed(2)} MWp)${rateNote}${econfNote}`,
          org.totalCost,
        );
      }
    });
  }

  // Hybrid tiered pricing (BLS and similar)
  if (result.hybridTieredBreakdown) {
    if (result.hybridTieredBreakdown.ongrid.cost > 0) {
      push(`On-Grid Sites Monitoring (${result.hybridTieredBreakdown.ongrid.mw.toFixed(2)} MW)`, result.hybridTieredBreakdown.ongrid.cost);
    }
    if (result.hybridTieredBreakdown.hybrid.cost > 0) {
      push(`Hybrid Sites Monitoring (${result.hybridTieredBreakdown.hybrid.mw.toFixed(2)} MW)`, result.hybridTieredBreakdown.hybrid.cost);
    }
  }

  // Elum Internal: graduated MW tiers
  if (!isElumSummary && result.elumInternalBreakdown) {
    result.elumInternalBreakdown.tiers.forEach((tier: any) => {
      if (tier.cost > 0) {
        const label = tier.label || `${tier.minMW}-${tier.maxMW === Infinity ? '∞' : tier.maxMW} MW`;
        push(`${label} (${tier.mwInTier.toFixed(2)} MW × ${currencySymbol}${tier.pricePerMW}/MW)`, tier.cost);
      }
    });
  }

  // Elum ePM: small/large site split
  if (!isElumSummary && result.elumEpmBreakdown) {
    const epm = result.elumEpmBreakdown;
    if (epm.smallSitesTotal > 0) {
      push(`Small Sites ≤${epm.threshold}kWp (${epm.smallSites?.length || 0} sites)`, epm.smallSitesTotal);
    }
    if (epm.largeSitesTotal > 0) {
      push(`Large Sites >${epm.threshold}kWp (${epm.largeSites?.length || 0} sites)`, epm.largeSitesTotal);
    }
  }

  // Elum Jubaili: per-site fee
  if (!isElumSummary && result.elumJubailiBreakdown) {
    const jb = result.elumJubailiBreakdown;
    push(`Per-Site Fee (${jb.siteCount} sites × ${currencySymbol}${jb.perSiteFee}/site)`, jb.totalCost);
  }

  // Elum: everything recurring collapses into one line, detail in the support doc
  if (isElumSummary) {
    const recurringTotal =
      (result.basePricingCost || 0) +
      (result.moduleCosts?.reduce((s: number, mc: any) => s + (mc.cost || 0), 0) || 0) +
      (result.minimumCharges || 0) +
      (result.siteMinimumPricingBreakdown
        ? (result.siteMinimumPricingBreakdown.normalPricingTotal || 0) +
          (result.siteMinimumPricingBreakdown.minimumPricingTotal || 0)
        : 0) +
      (ob?.totalCost || 0) +
      (result.elumInternalBreakdown?.totalCost || 0) +
      (result.elumEpmBreakdown?.totalCost || 0) +
      (result.elumJubailiBreakdown?.totalCost || 0) +
      (result.minimumContractAdjustment || 0);

    if (recurringTotal > 0) {
      const siteCount = ob
        ? ob.orgs.reduce((s: number, o: any) => s + (o.siteCount || 0), 0)
        : (result.elumEpmBreakdown
            ? (result.elumEpmBreakdown.smallSites?.length || 0) + (result.elumEpmBreakdown.largeSites?.length || 0)
            : result.elumJubailiBreakdown?.siteCount || 0);
      const totalMWp = ob
        ? ob.orgs.reduce((s: number, o: any) => s + (o.totalMWp || 0), 0)
        : Number(mwManaged) || 0;

      const scopeParts: string[] = [];
      if (siteCount > 0) scopeParts.push(`${siteCount} sites`);
      if (totalMWp > 0) scopeParts.push(`${Number(totalMWp).toFixed(2)} MWp`);
      const scope = scopeParts.length > 0 ? ` (${scopeParts.join(', ')})` : '';

      push(
        `${elumPackageLabel(packageType)} — Platform Monitoring${scope} — see attached support document for the detailed breakdown`,
        recurringTotal,
      );
    }
  }

  return items;
}

export interface ContractLineItemOptions extends SharedLineItemOptions {
  /** Implementation Fees account code (NRR), usually "1000" */
  implementationAccountCode?: string;
  /** 2026 trial one-off fees, taken from the contract row */
  isTrial?: boolean;
  trialSetupFee?: number;
  vendorApiOnboardingFee?: number;
}

/**
 * Full line-item set for a single contract invoice: the package-specific
 * recurring lines plus modules, site-minimum splits, base fee, minimum
 * adjustment, retainer, addons and 2026 trial fees.
 *
 * Used by the revision flow, which has to rebuild an invoice's lines from a
 * frozen snapshot without the calculator's live UI state.
 */
export function buildContractLineItems(options: ContractLineItemOptions): XeroLineItem[] {
  const {
    result,
    packageType,
    currencySymbol,
    accountCode,
    implementationAccountCode = '1000',
    prefix = '',
    mwManaged,
  } = options;

  const items: XeroLineItem[] = [];
  const isElumSummary = isElumPackage(packageType);
  const push = (Description: string, UnitAmount: number, account = accountCode) =>
    items.push({ Description: `${prefix}${Description}`, Quantity: 1, UnitAmount, AccountCode: account });

  // Module costs — suppressed where a dedicated block already covers them.
  const spsB = result.spsAnnualUpfrontBreakdown;
  const suppressModules =
    !!result.perMWAnnualUpfrontBreakdown || spsB?.cycleType === 'annual_upfront' || isElumSummary;
  if (Array.isArray(result.moduleCosts) && !suppressModules) {
    result.moduleCosts.forEach((mc: any) => push(mc.moduleName, mc.cost));
  }

  items.push(...buildPackageLineItems(options));

  if (!isElumSummary && result.siteMinimumPricingBreakdown) {
    const sm = result.siteMinimumPricingBreakdown;
    if (sm.normalPricingTotal > 0) {
      push(`Monitoring Fee - Sites Above Threshold (${sm.sitesAboveThreshold} sites)`, sm.normalPricingTotal);
    }
    if (sm.minimumPricingTotal > 0) {
      push(
        `Monitoring Fee - Sites Below Threshold (${sm.sitesBelowThreshold} sites, minimum charge)`,
        sm.minimumPricingTotal,
      );
    }
  }

  if (!isElumSummary && result.basePricingCost > 0) {
    push('Base Monthly Fee', result.basePricingCost);
  }

  if (!isElumSummary && result.minimumContractAdjustment > 0) {
    push('Minimum Contract Adjustment', result.minimumContractAdjustment);
  }

  if (result.retainerCost > 0) {
    push('Retainer Hours', result.retainerCost);
  }

  if (Array.isArray(result.addonCosts)) {
    result.addonCosts.forEach((ac: any) =>
      push(ac.name, ac.cost, ac.addonId === 'satelliteDataAPI' ? accountCode : implementationAccountCode),
    );
  }

  if (options.isTrial) {
    if (options.trialSetupFee) push('Trial Setup Fee', options.trialSetupFee, implementationAccountCode);
    if (options.vendorApiOnboardingFee) {
      push('Vendor API Onboarding Fee', options.vendorApiOnboardingFee, implementationAccountCode);
    }
  }

  // `currencySymbol` and `mwManaged` are consumed by buildPackageLineItems.
  void currencySymbol;
  void mwManaged;

  return items;
}
