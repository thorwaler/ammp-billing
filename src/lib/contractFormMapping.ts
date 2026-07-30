/**
 * Single source of truth for turning a `contracts` database row into the
 * `existingContract` prop shape consumed by `ContractForm`.
 *
 * Every edit entry point (contract list, contract detail page, customer card)
 * must use this mapper. Hand-written per-call-site maps drift and silently drop
 * fields — a dropped boolean is written back as `false` on the next save, which
 * is how `zero_pv_alert_enabled` kept resetting itself.
 */

type AnyRow = Record<string, any>;

export interface ContractFormValues {
  id: string;
  contractName?: string;
  package: string;
  modules: any[];
  addons: any[];
  initialMW: number;
  billingFrequency: string;
  invoicingType?: string;
  invoiceLeadDays?: number;
  nextInvoiceDate?: string;
  customPricing?: any;
  volumeDiscounts?: any;
  minimumCharge?: number;
  minimumAnnualValue?: number;
  baseMonthlyPrice?: number;
  retainerHours?: number;
  retainerHourlyRate?: number;
  retainerMinimumValue?: number;
  onboardingFeePerSite?: number;
  annualFeePerSite?: number;
  maxMw?: number;
  currency: string;
  signedDate?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  contractStatus?: string;
  portfolioDiscountTiers?: any[];
  minimumChargeTiers?: any[];
  siteChargeFrequency?: string;
  contractExpiryDate?: string;
  ammpAssetGroupId?: string;
  ammpAssetGroupName?: string;
  ammpAssetGroupIdAnd?: string;
  ammpAssetGroupNameAnd?: string;
  ammpAssetGroupIdNot?: string;
  ammpAssetGroupNameNot?: string;
  contractAmmpOrgId?: string;
  siteSizeThresholdKwp?: number;
  belowThresholdPricePerMWp?: number;
  aboveThresholdPricePerMWp?: number;
  ammpOrgId?: string;
  ammpSyncStatus?: string;
  lastAmmpSync?: string;
  cachedCapabilities?: any;
  graduatedMWTiers?: any[];
  elumParentOrgId?: string;
  elumLiteBaseRate?: number;
  elumLiteEconfRate?: number;
  elumInternalBrackets?: any[];
  elumInternalEconfRate?: number;
  isTrial?: boolean;
  trialSetupFee?: number;
  vendorApiOnboardingFee?: number;
  municipalityCount?: number;
  apiSetupFee?: number;
  hourlyRate?: number;
  upfrontDiscountPercent?: number;
  commitmentDiscountPercent?: number;
  irradiancePerSiteTiers?: any[];
  performancePerMwpTiers?: any[];
  onboardingSetupFee?: number;
  vendorApiFee?: number;
  annualMinimumFee?: number;
  committedMinimumMW?: number;
  annualBillingAnchorDate?: string;
  invoiceFreezeEnabled?: boolean;
  zeroPvAlertEnabled?: boolean;
  zeroPvEstimateMultiplier?: number;
  zeroPvGraceDays?: number;
  annualMinimumMode?: string;
  inflationCapEnabled?: boolean;
  anniversaryNoticeDays?: number;
  contractTypeId?: string;
}

/** Normalise `null` to `undefined` while preserving valid `0` / `false`. */
const v = <T,>(value: T | null | undefined): T | undefined =>
  value === null || value === undefined ? undefined : value;

export function mapContractRowToFormValues(row: AnyRow): ContractFormValues {
  const orgPricing = (row.org_pricing_config || {}) as AnyRow;

  return {
    id: row.id,
    contractName: v(row.contract_name),
    package: row.package,
    modules: row.modules || [],
    addons: row.addons || [],
    initialMW: row.initial_mw,
    billingFrequency: row.billing_frequency || "annual",
    invoicingType: v(row.invoicing_type),
    invoiceLeadDays: v(row.invoice_lead_days),
    nextInvoiceDate: v(row.next_invoice_date),
    customPricing: v(row.custom_pricing),
    volumeDiscounts: v(row.volume_discounts),
    minimumCharge: v(row.minimum_charge),
    minimumAnnualValue: v(row.minimum_annual_value),
    baseMonthlyPrice: v(row.base_monthly_price),
    retainerHours: v(row.retainer_hours),
    retainerHourlyRate: v(row.retainer_hourly_rate),
    retainerMinimumValue: v(row.retainer_minimum_value),
    onboardingFeePerSite: v(row.onboarding_fee_per_site),
    annualFeePerSite: v(row.annual_fee_per_site),
    maxMw: v(row.max_mw),
    currency: row.currency || "EUR",
    signedDate: v(row.signed_date),
    periodStart: v(row.period_start),
    periodEnd: v(row.period_end),
    notes: v(row.notes),
    contractStatus: v(row.contract_status),
    portfolioDiscountTiers: v(row.portfolio_discount_tiers),
    minimumChargeTiers: v(row.minimum_charge_tiers),
    siteChargeFrequency: v(row.site_charge_frequency),
    contractExpiryDate: v(row.contract_expiry_date),

    // AMMP asset-group filtering
    ammpAssetGroupId: v(row.ammp_asset_group_id),
    ammpAssetGroupName: v(row.ammp_asset_group_name),
    ammpAssetGroupIdAnd: v(row.ammp_asset_group_id_and),
    ammpAssetGroupNameAnd: v(row.ammp_asset_group_name_and),
    ammpAssetGroupIdNot: v(row.ammp_asset_group_id_not),
    ammpAssetGroupNameNot: v(row.ammp_asset_group_name_not),
    contractAmmpOrgId: v(row.contract_ammp_org_id),
    ammpOrgId: v(row.ammp_org_id),
    ammpSyncStatus: v(row.ammp_sync_status),
    lastAmmpSync: v(row.last_ammp_sync),
    cachedCapabilities: v(row.cached_capabilities),

    // Site-size threshold pricing
    siteSizeThresholdKwp: v(row.site_size_threshold_kwp),
    belowThresholdPricePerMWp: v(row.below_threshold_price_per_mwp),
    aboveThresholdPricePerMWp: v(row.above_threshold_price_per_mwp),

    // Elum
    graduatedMWTiers: v(row.graduated_mw_tiers),
    elumParentOrgId: v(row.elum_parent_org_id),
    elumLiteBaseRate: v(orgPricing.liteBaseRate),
    elumLiteEconfRate: v(orgPricing.liteEconfRate),
    elumInternalBrackets: v(orgPricing.internalBrackets),
    elumInternalEconfRate: v(orgPricing.internalEconfRate),

    // AMMP OS 2026 trial
    isTrial: v(row.is_trial),
    trialSetupFee: v(row.trial_setup_fee),
    vendorApiOnboardingFee: v(row.vendor_api_onboarding_fee),

    // SolarAfrica API
    municipalityCount: v(row.municipality_count),
    apiSetupFee: v(row.api_setup_fee),
    hourlyRate: v(row.hourly_rate),

    // SPS Monitoring discounts
    upfrontDiscountPercent: v(row.upfront_discount_percent),
    commitmentDiscountPercent: v(row.commitment_discount_percent),

    // Matriarch API
    irradiancePerSiteTiers: v(row.irradiance_per_site_tiers),
    performancePerMwpTiers: v(row.performance_per_mwp_tiers),
    onboardingSetupFee: v(row.onboarding_setup_fee),
    vendorApiFee: v(row.vendor_api_fee),

    // Per-MW + annual upfront minimum
    annualMinimumFee: v(row.annual_minimum_fee),
    committedMinimumMW: v(row.committed_minimum_mw),
    annualBillingAnchorDate: v(row.annual_billing_anchor_date),

    // Invoice input freezing (default on when the column is null on legacy rows)
    invoiceFreezeEnabled: row.invoice_freeze_enabled !== false,

    // Elum foundations
    zeroPvAlertEnabled: v(row.zero_pv_alert_enabled),
    zeroPvEstimateMultiplier: v(row.zero_pv_estimate_multiplier),
    zeroPvGraceDays: v(row.zero_pv_grace_days),
    annualMinimumMode: v(row.annual_minimum_mode),
    inflationCapEnabled: v(row.inflation_cap_enabled),
    anniversaryNoticeDays: v(row.anniversary_notice_days),

    contractTypeId: v(row.contract_type_id),
  };
}

/**
 * Build form values for duplicating a contract: every pricing/config field is
 * kept, but identity, AMMP sync state, document and billing-progress fields are
 * stripped so the copy starts clean and re-syncs fresh.
 */
export function buildDuplicateFormValues(row: AnyRow): ContractFormValues {
  const base = mapContractRowToFormValues(row);
  const name = base.contractName?.trim();

  return {
    ...base,
    id: "",
    contractName: name ? `${name} (Copy)` : "Copy",
    // AMMP sync state — cleared so the duplicate syncs from scratch
    cachedCapabilities: undefined,
    ammpSyncStatus: undefined,
    lastAmmpSync: undefined,
    // Billing progress starts clean
    nextInvoiceDate: undefined,
    contractStatus: "active",
  };
}

