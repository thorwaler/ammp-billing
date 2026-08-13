import { SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { formatDateCET } from "@/lib/dateUtils";

interface SupportDocumentProps {
  data: SupportDocumentData;
}

export function SupportDocument({ data }: SupportDocumentProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: data.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div id="support-document" className="bg-background p-6 max-w-7xl mx-auto text-xs" style={{ fontFamily: 'Arial, sans-serif', fontSize: '10px' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-2">Invoice Support Document</h1>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Customer:</strong> {data.customerName}</p>
            {data.contractName && (
              <p><strong>Contract:</strong> {data.contractName}</p>
            )}
            <p><strong>Invoice Period:</strong> {data.invoicePeriod}</p>
          </div>
          <div>
            <p><strong>Date:</strong> {formatDateCET(typeof data.invoiceDate === 'string' ? data.invoiceDate : data.invoiceDate.toISOString(), 'dd MMM yyyy')}</p>
            <p><strong>Currency:</strong> {data.currency}</p>
            {data.discountPercent > 0 && (
              <p><strong>Portfolio Discount:</strong> {data.discountPercent}%</p>
            )}
          </div>
        </div>
      </div>

      {/* Year Overview */}
      <section className="mb-6">
        <h2 className="text-base font-bold mb-3">Year-to-Date Invoice Summary</h2>
        <table className="w-full border-collapse border border-border text-xs">
          <thead>
            <tr style={{ backgroundColor: '#f4f4f5' }}>
              <th className="border border-border p-1 text-left">Period</th>
              <th className="border border-border p-1 text-right">Monitoring Fee</th>
              <th className="border border-border p-1 text-right">Solcast Fee</th>
              <th className="border border-border p-1 text-right">Additional Work</th>
              <th className="border border-border p-1 text-right">Total ({data.currency})</th>
            </tr>
          </thead>
          <tbody>
            {data.yearInvoices.map((inv, idx) => (
              <tr key={idx}>
                <td className="border border-border p-1">{inv.period}</td>
                <td className="border border-border p-1 text-right">{formatCurrency(inv.monitoringFee)}</td>
                <td className="border border-border p-1 text-right">{formatCurrency(inv.solcastFee)}</td>
                <td className="border border-border p-1 text-right">{formatCurrency(inv.additionalWork)}</td>
                <td className="border border-border p-1 text-right font-medium">{formatCurrency(inv.total)}</td>
              </tr>
            ))}
            <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
              <td className="border border-border p-1" colSpan={4}>Year Total:</td>
              <td className="border border-border p-1 text-right">{formatCurrency(data.yearTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Elum ePM Breakdown (if applicable) */}
      {data.elumEpmBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Elum ePM Pricing Breakdown</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
            <div>
              <p><strong>Site Size Threshold:</strong> {data.elumEpmBreakdown.threshold} kWp</p>
              <p><strong>Small Sites (≤ threshold):</strong> {data.elumEpmBreakdown.smallSitesCount} sites @ {formatCurrency(data.elumEpmBreakdown.belowThresholdRate)}/MWp</p>
              <p><strong>Large Sites ({'>'}threshold):</strong> {data.elumEpmBreakdown.largeSitesCount} sites @ {formatCurrency(data.elumEpmBreakdown.aboveThresholdRate)}/MWp</p>
            </div>
            <div>
              <p><strong>Small Sites Total:</strong> {formatCurrency(data.elumEpmBreakdown.smallSitesTotal)}</p>
              <p><strong>Large Sites Total:</strong> {formatCurrency(data.elumEpmBreakdown.largeSitesTotal)}</p>
              {data.elumEpmBreakdown.sitesUsingMinimum > 0 && (
                <p><strong>Sites Using Minimum Fee:</strong> {data.elumEpmBreakdown.sitesUsingMinimum}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Elum Jubaili Breakdown (if applicable) */}
      {data.elumJubailiBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Elum Jubaili Pricing Breakdown (genset kVA bands)</h2>
          <table className="w-full text-xs border-collapse mb-3">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-1 text-left">Band</th>
                <th className="border border-border p-1 text-right">Fee / site / year</th>
                <th className="border border-border p-1 text-right">Sites</th>
                <th className="border border-border p-1 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.elumJubailiBreakdown.bands.map((band, i) => (
                <tr key={i}>
                  <td className="border border-border p-1">{band.label}</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(band.annualFee)}</td>
                  <td className="border border-border p-1 text-right">{band.siteCount}</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(band.cost)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-border p-1" colSpan={2}>Banded total</td>
                <td className="border border-border p-1 text-right">{data.elumJubailiBreakdown.siteCount}</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.elumJubailiBreakdown.bandedCost)}</td>
              </tr>
              {data.elumJubailiBreakdown.minimumApplied && (
                <tr>
                  <td className="border border-border p-1" colSpan={3}>
                    Minimum annual fee top-up ({formatCurrency(data.elumJubailiBreakdown.minimumAnnualFee)}/year)
                  </td>
                  <td className="border border-border p-1 text-right">{formatCurrency(data.elumJubailiBreakdown.minimumTopUp)}</td>
                </tr>
              )}
              <tr className="font-bold">
                <td className="border border-border p-1" colSpan={3}>Total</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.elumJubailiBreakdown.totalCost)}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-1 text-left">Site</th>
                <th className="border border-border p-1 text-right">Genset (kVA)</th>
                <th className="border border-border p-1 text-left">Band</th>
                <th className="border border-border p-1 text-right">{data.currency}/kVA/yr</th>
                <th className="border border-border p-1 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.elumJubailiBreakdown.sites.map((site) => (
                <tr key={site.assetId}>
                  <td className="border border-border p-1">{site.assetName}</td>
                  <td className="border border-border p-1 text-right">
                    {site.kva != null ? site.kva.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                  </td>
                  <td className="border border-border p-1">
                    {site.status === 'unrated'
                      ? site.unratedReason === 'zero'
                        ? 'Rating 0 kVA — not billed'
                        : site.unratedReason === 'out_of_bands'
                          ? 'Outside all bands — not billed'
                          : 'Rating not set in AMMP — not billed'
                      : site.bandLabel}
                    {site.status === 'clamped' ? ' (clamped)' : ''}
                  </td>
                  <td className="border border-border p-1 text-right">
                    {site.kva && site.kva > 0 && site.annualFee
                      ? (site.annualFee / site.kva).toFixed(2)
                      : '—'}
                  </td>
                  <td className="border border-border p-1 text-right">{formatCurrency(site.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Minimum annual fee reconciliation */}
          <table className="w-full text-xs border-collapse mt-3">
            <tbody>
              <tr>
                <td className="border border-border p-1">Banded fees for this period</td>
                <td className="border border-border p-1 text-right">
                  {formatCurrency(data.elumJubailiBreakdown.bandedCost)}
                </td>
              </tr>
              <tr>
                <td className="border border-border p-1">
                  Contract minimum ({formatCurrency(data.elumJubailiBreakdown.minimumAnnualFee)}/year, pro-rated to this period)
                </td>
                <td className="border border-border p-1 text-right">
                  {formatCurrency(
                    data.elumJubailiBreakdown.bandedCost + data.elumJubailiBreakdown.minimumTopUp
                  )}
                </td>
              </tr>
              <tr className="font-bold">
                <td className="border border-border p-1">
                  Charged (higher of the two)
                  {data.elumJubailiBreakdown.minimumApplied ? ' — minimum applies' : ' — banded fees apply'}
                </td>
                <td className="border border-border p-1 text-right">
                  {formatCurrency(data.elumJubailiBreakdown.totalCost)}
                </td>
              </tr>
            </tbody>
          </table>


          {(data.elumJubailiBreakdown.unratedCount > 0 || data.elumJubailiBreakdown.clampedCount > 0) && (
            <p className="text-xs mt-2">
              {data.elumJubailiBreakdown.unratedCount} site(s) have no usable genset rating in AMMP and are excluded from billing
              {data.elumJubailiBreakdown.clampedCount > 0
                ? `; ${data.elumJubailiBreakdown.clampedCount} site(s) fall outside the configured bands and were clamped to the nearest band`
                : ''}
              .
            </p>
          )}
        </section>
      )}

      {/* Elum Internal Breakdown (if applicable) */}
      {data.elumInternalBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Elum Internal Assets - Graduated Tier Pricing</h2>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5' }}>
                <th className="border border-border p-1 text-left">Tier</th>
                <th className="border border-border p-1 text-right">MW in Tier</th>
                <th className="border border-border p-1 text-right">Price per MW ({data.currency})</th>
                <th className="border border-border p-1 text-right">Cost ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {data.elumInternalBreakdown.tiers.map((tier, idx) => (
                <tr key={idx}>
                  <td className="border border-border p-1">{tier.label}</td>
                  <td className="border border-border p-1 text-right">{tier.mwInTier.toFixed(2)}</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(tier.pricePerMW)}</td>
                  <td className="border border-border p-1 text-right font-medium">{formatCurrency(tier.cost)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                <td className="border border-border p-1">Total</td>
                <td className="border border-border p-1 text-right">{data.elumInternalBreakdown.totalMW.toFixed(2)}</td>
                <td className="border border-border p-1"></td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.elumInternalBreakdown.totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Elum 2026 Org-Based Tier Breakdown */}
      {data.elumOrgTierBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">
            {data.elumOrgTierBreakdown.tierLabel} — Organisation Breakdown
          </h2>

          {data.elumOrgTierBreakdown.warnings.length > 0 && (
            <div className="mb-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
              {data.elumOrgTierBreakdown.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {/* Summary: one row per sub-organisation */}
          <table className="w-full border-collapse text-xs mb-4">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-1 text-left">Organisation</th>
                <th className="border border-border p-1 text-right">Sites</th>
                <th className="border border-border p-1 text-right">MWp</th>
                <th className="border border-border p-1 text-left">Rate</th>
                <th className="border border-border p-1 text-right">Base</th>
                <th className="border border-border p-1 text-right">Remote eConf</th>
                <th className="border border-border p-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.elumOrgTierBreakdown.orgs.map(org => (
                <tr key={org.orgId}>
                  <td className="border border-border p-1">
                    {org.orgName}
                    {org.uid ? ` (#${org.uid})` : ''}
                    {org.isLegacyAssetGroup ? ' — legacy asset group' : ''}
                  </td>
                  <td className="border border-border p-1 text-right">{org.siteCount}</td>
                  <td className="border border-border p-1 text-right">{org.totalMWp.toFixed(3)}</td>
                  <td className="border border-border p-1">
                    {org.appliedRate != null
                      ? (() => {
                          const effective = org.appliedRate + (org.econfApplied ? (org.econfRate || 0) : 0);
                          return (
                            <>
                              {formatCurrency(effective)}/MWp/yr
                              {org.appliedTierLabel ? ` (${org.appliedTierLabel})` : ''}
                              {org.econfApplied && org.econfRate ? (
                                <div className="text-[10px] text-muted-foreground">
                                  base {formatCurrency(org.appliedRate)} + eConf {formatCurrency(org.econfRate)}
                                </div>
                              ) : null}
                            </>
                          );
                        })()
                      : 'Per-site size buckets'}
                  </td>
                  <td className="border border-border p-1 text-right">{formatCurrency(org.baseCost)}</td>
                  <td className="border border-border p-1 text-right">
                    {org.econfApplied ? formatCurrency(org.econfCost) : '—'}
                  </td>
                  <td className="border border-border p-1 text-right">{formatCurrency(org.totalCost)}</td>
                </tr>
              ))}
              <tr className="font-bold bg-muted/50">
                <td className="border border-border p-1">Total</td>
                <td className="border border-border p-1 text-right">
                  {data.elumOrgTierBreakdown.orgs.reduce((n, o) => n + o.siteCount, 0)}
                </td>
                <td className="border border-border p-1 text-right">{data.elumOrgTierBreakdown.totalMWp.toFixed(3)}</td>
                <td className="border border-border p-1"></td>
                <td className="border border-border p-1"></td>
                <td className="border border-border p-1"></td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.elumOrgTierBreakdown.totalCost)}</td>
              </tr>
            </tbody>
          </table>

          {data.elumOrgTierBreakdown.orgs.some(o => o.econfCost > 0) && (
            <p className="text-xs text-muted-foreground mb-4">
              Remote eConf is shown separately here for transparency, but it is invoiced within the
              organisation's single line item (Total column). In the per-site tables below, sites of an
              organisation with remote eConf are shown at the combined rate (base + eConf).
            </p>
          )}



          {/* Per-organisation asset lists */}
          {data.elumOrgTierBreakdown.orgs.map(org => (
            <div key={`sites-${org.orgId}`} className="mb-4">
              <h3 className="text-sm font-semibold mb-1">
                {org.orgName} — {org.siteCount} sites, {org.totalMWp.toFixed(3)} MWp, {formatCurrency(org.totalCost)}
              </h3>
              {org.warnings.map((w, i) => (
                <p key={i} className="text-xs text-destructive mb-1">{w}</p>
              ))}
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border p-1 text-left">Site</th>
                    <th className="border border-border p-1 text-left">Asset ID</th>
                    <th className="border border-border p-1 text-right">MWp</th>
                    <th className="border border-border p-1 text-left">Band</th>
                    <th className="border border-border p-1 text-right">Rate/MWp/yr</th>
                    <th className="border border-border p-1 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {org.sites.map(site => (
                    <tr key={site.assetId}>
                      <td className="border border-border p-1">
                        {site.assetName}
                        {site.isMwhOverride ? ' (battery-only, MWh entered as capacity)' : ''}
                      </td>
                      <td className="border border-border p-1">{site.assetId}</td>
                      <td className="border border-border p-1 text-right">{site.mwp.toFixed(3)}</td>
                      <td className="border border-border p-1">{site.bucketLabel || '—'}</td>
                      <td className="border border-border p-1 text-right">{formatCurrency(site.pricePerMWp)}</td>
                      <td className="border border-border p-1 text-right">{formatCurrency(site.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted font-semibold">
                    <td className="border border-border p-1" colSpan={2}>Total</td>
                    <td className="border border-border p-1 text-right">{org.totalMWp.toFixed(3)}</td>
                    <td className="border border-border p-1"></td>
                    <td className="border border-border p-1"></td>
                    <td className="border border-border p-1 text-right">{formatCurrency(org.totalCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          {data.elumOrgTierBreakdown.doubleCountWarnings && data.elumOrgTierBreakdown.doubleCountWarnings.length > 0 && (
            <div className="mb-3 text-xs">
              <h3 className="text-sm font-semibold mb-1">Assets de-duplicated across org and asset group</h3>
              <p className="mb-1">
                These assets were resolved from both an organisation and the legacy asset group. They are billed
                once, under the organisation.
              </p>
              <ul className="list-disc pl-5">
                {data.elumOrgTierBreakdown.doubleCountWarnings.map(d => (
                  <li key={d.assetId}>{d.assetName} — counted under {d.orgName}</li>
                ))}
              </ul>
            </div>
          )}

          {data.elumOrgTierBreakdown.unassignedOrgs && data.elumOrgTierBreakdown.unassignedOrgs.length > 0 && (
            <div className="text-xs">
              <h3 className="text-sm font-semibold mb-1">Sub-organisations without a tier flag</h3>
              <p className="mb-1">Not invoiced. Set a tier feature flag in ePM to include them.</p>
              <ul className="list-disc pl-5">
                {data.elumOrgTierBreakdown.unassignedOrgs.map(o => (
                  <li key={o.orgId}>{o.orgName}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Matriarch API Dual-Stream Breakdown */}
      {data.matriarchApiBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Matriarch API — Dual Subscription Breakdown</h2>
          
          {/* Irradiance-only sites */}
          <div className="mb-3">
            <h3 className="text-sm font-semibold mb-1">1. Irradiance-Only Sites (Monthly Per-Site)</h3>
            <table className="w-full border-collapse border border-border text-xs mb-2">
              <tbody>
                <tr>
                  <td className="border border-border p-1">Number of irradiance-only sites</td>
                  <td className="border border-border p-1 text-right">{data.matriarchApiBreakdown.irradianceOnlySites}</td>
                </tr>
                <tr>
                  <td className="border border-border p-1">Rate per site per month</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(data.matriarchApiBreakdown.irradiancePerSiteRate)}</td>
                </tr>
                <tr>
                  <td className="border border-border p-1">Monthly total</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(data.matriarchApiBreakdown.irradianceMonthlyTotal)}</td>
                </tr>
                <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                  <td className="border border-border p-1">Annual total</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(data.matriarchApiBreakdown.irradianceAnnualTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Performance sites */}
          <div className="mb-3">
            <h3 className="text-sm font-semibold mb-1">2. Asset Performance Sites (Annual Per-MWp, Graduated)</h3>
            <table className="w-full border-collapse border border-border text-xs mb-2">
              <thead>
                <tr style={{ backgroundColor: '#f4f4f5' }}>
                  <th className="border border-border p-1 text-left">Tier</th>
                  <th className="border border-border p-1 text-right">MWp in Tier</th>
                  <th className="border border-border p-1 text-right">Rate/MWp/yr</th>
                  <th className="border border-border p-1 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.matriarchApiBreakdown.performanceTierBreakdown.map((tier, idx) => (
                  <tr key={idx}>
                    <td className="border border-border p-1">{tier.label}</td>
                    <td className="border border-border p-1 text-right">{tier.mwInTier.toFixed(2)}</td>
                    <td className="border border-border p-1 text-right">{formatCurrency(tier.pricePerMWp)}</td>
                    <td className="border border-border p-1 text-right">{formatCurrency(tier.cost)}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                  <td className="border border-border p-1">Total ({data.matriarchApiBreakdown.performanceSites} sites, {data.matriarchApiBreakdown.performanceTotalMWp.toFixed(2)} MWp)</td>
                  <td className="border border-border p-1" colSpan={2}></td>
                  <td className="border border-border p-1 text-right">{formatCurrency(data.matriarchApiBreakdown.performanceAnnualTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Combined total */}
          <div className="p-2 rounded font-bold text-sm" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
            <div className="flex justify-between">
              <span>Combined Annual Total:</span>
              <span>{formatCurrency(data.matriarchApiBreakdown.totalAnnualCost)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Per-Site Billing Breakdown (UNHCR-style) */}
      {data.perSiteBreakdown && (data.perSiteBreakdown.onboardingCost > 0 || data.perSiteBreakdown.annualSubscriptionCost > 0) && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Per-Site Billing Breakdown</h2>
          
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 text-sm mb-3 p-2 rounded" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
            <div>
              <p><strong>Onboarding Fee per Site:</strong> {formatCurrency(data.perSiteBreakdown.onboardingFeePerSite)}</p>
              <p><strong>Sites Onboarded:</strong> {data.perSiteBreakdown.sitesOnboarded}</p>
              <p><strong>Total Onboarding:</strong> {formatCurrency(data.perSiteBreakdown.onboardingCost)}</p>
            </div>
            <div>
              <p><strong>Annual Fee per Site:</strong> {formatCurrency(data.perSiteBreakdown.annualFeePerSite)}</p>
              <p><strong>Sites Renewed:</strong> {data.perSiteBreakdown.sitesRenewed}</p>
              <p><strong>Total Subscriptions:</strong> {formatCurrency(data.perSiteBreakdown.annualSubscriptionCost)}</p>
            </div>
          </div>
          
          {/* Site-by-site table */}
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5' }}>
                <th className="border border-border p-1 text-left">Site Name</th>
                <th className="border border-border p-1 text-right">Capacity (kWp)</th>
                <th className="border border-border p-1 text-center">Onboarding Date</th>
                <th className="border border-border p-1 text-center">Type</th>
                <th className="border border-border p-1 text-right">Amount ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {data.perSiteBreakdown.siteBreakdown.map((site, idx) => (
                <tr key={idx}>
                  <td className="border border-border p-1">{site.assetName}</td>
                  <td className="border border-border p-1 text-right">{site.capacityKwp?.toFixed(1) || '-'}</td>
                  <td className="border border-border p-1 text-center">
                    {site.onboardingDate ? formatDateCET(site.onboardingDate, 'dd MMM yyyy') : '-'}
                  </td>
                  <td className="border border-border p-1 text-center">
                    {site.isOnboarding && site.isRenewal ? 'Onboarding + Renewal' : 
                     site.isOnboarding ? 'Onboarding' : 'Annual Renewal'}
                  </td>
                  <td className="border border-border p-1 text-right font-medium">{formatCurrency(site.fee)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                <td className="border border-border p-1" colSpan={4}>Total:</td>
                <td className="border border-border p-1 text-right">
                  {formatCurrency(data.perSiteBreakdown.onboardingCost + data.perSiteBreakdown.annualSubscriptionCost)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Per-MW + Annual Upfront Minimum Breakdown */}
      {data.perMWAnnualUpfrontBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Per-MW + Annual Upfront Minimum</h2>
          <div className="text-sm p-3 rounded space-y-1" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
            <p>
              <strong>Billing Cycle:</strong>{' '}
              {data.perMWAnnualUpfrontBreakdown.cycleType === 'annual_upfront'
                ? 'Annual upfront (minimum floor billed at start of year)'
                : 'Quarterly overage (per-MW value exceeded annual minimum YTD)'}
            </p>
            <p><strong>Per-MWp Rate:</strong> {formatCurrency(data.perMWAnnualUpfrontBreakdown.perMWpRate)}/MWp/year</p>
            <p>
              <strong>MW-Based Minimum (synced):</strong>{' '}
              {data.perMWAnnualUpfrontBreakdown.syncedMW.toFixed(2)} MW ×{' '}
              {formatCurrency(data.perMWAnnualUpfrontBreakdown.perMWpRate)} ={' '}
              {formatCurrency(data.perMWAnnualUpfrontBreakdown.mwBasedFloor)}
            </p>
            <p>
              <strong>Fixed Annual Minimum:</strong>{' '}
              {formatCurrency(data.perMWAnnualUpfrontBreakdown.fixedAnnualMinimum)}
            </p>
            <p className="font-bold pt-1 border-t border-border/50">
              Annual Floor (max of above): {formatCurrency(data.perMWAnnualUpfrontBreakdown.annualFloor)}
            </p>
            {data.perMWAnnualUpfrontBreakdown.cycleType === 'quarterly_overage' && (
              <div className="pt-2 mt-2 border-t border-border/50 space-y-1">
                <p><strong>YTD Module Value:</strong> {formatCurrency(data.perMWAnnualUpfrontBreakdown.ytdModuleValue)}</p>
                <p><strong>YTD Already Invoiced:</strong> {formatCurrency(data.perMWAnnualUpfrontBreakdown.ytdInvoiced)}</p>
                <p className="font-bold">
                  Overage Charged This Quarter: {formatCurrency(data.perMWAnnualUpfrontBreakdown.overageAmount)}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SPS Monitoring Annual Upfront Dual Cadence */}
      {data.spsAnnualUpfrontBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">SPS Annual Upfront Billing</h2>
          <div className="text-sm p-3 rounded space-y-1" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
            <p>
              <strong>Billing Cycle:</strong>{' '}
              {data.spsAnnualUpfrontBreakdown.cycleType === 'annual_upfront'
                ? 'Annual upfront (full year billed at anchor date)'
                : 'Quarterly with prepaid-balance credit'}
            </p>
            <p>
              <strong>Discounted Annual SPS Value:</strong>{' '}
              {formatCurrency(data.spsAnnualUpfrontBreakdown.annualDiscountedFee)}
            </p>
            <p>
              <strong>Minimum Annual Contract Value:</strong>{' '}
              {formatCurrency(data.spsAnnualUpfrontBreakdown.annualMinimum)}
            </p>
            <p className="font-bold pt-1 border-t border-border/50">
              Annual Upfront Amount (max of above):{' '}
              {formatCurrency(data.spsAnnualUpfrontBreakdown.annualUpfrontAmount)}
            </p>
            {data.spsAnnualUpfrontBreakdown.cycleType === 'quarterly_with_credit' && (
              <div className="pt-2 mt-2 border-t border-border/50 space-y-1">
                <p><strong>Full Quarterly Fee:</strong> {formatCurrency(data.spsAnnualUpfrontBreakdown.quarterCost)}</p>
                <p><strong>Prepaid Balance Before:</strong> {formatCurrency(data.spsAnnualUpfrontBreakdown.prepaidBalanceBefore)}</p>
                <p><strong>Credit Applied This Quarter:</strong> −{formatCurrency(data.spsAnnualUpfrontBreakdown.creditApplied)}</p>
                <p><strong>Prepaid Balance Remaining:</strong> {formatCurrency(data.spsAnnualUpfrontBreakdown.prepaidBalanceAfter)}</p>
                <p className="font-bold">
                  Net Invoiced This Quarter:{' '}
                  {formatCurrency(data.spsAnnualUpfrontBreakdown.quarterCost - data.spsAnnualUpfrontBreakdown.creditApplied)}
                </p>
              </div>
            )}
          </div>
        </section>
      )}


      {/* Solcast Tracking (if applicable) */}
      {data.solcastBreakdown && data.solcastBreakdown.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Solcast Fee Breakdown</h2>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5' }}>
                <th className="border border-border p-1 text-left">Month</th>
                <th className="border border-border p-1 text-right">Number of Sites</th>
                <th className="border border-border p-1 text-right">Price per Site ({data.currency})</th>
                <th className="border border-border p-1 text-right">Total ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {data.solcastBreakdown.map((item, idx) => (
                <tr key={idx}>
                  <td className="border border-border p-1">{item.month}</td>
                  <td className="border border-border p-1 text-right">{item.siteCount}</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(item.pricePerSite)}</td>
                  <td className="border border-border p-1 text-right">{formatCurrency(item.totalPerMonth)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                <td className="border border-border p-1" colSpan={3}>Total:</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.solcastTotal || 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Other Addons (if applicable) */}
      {data.addonsBreakdown && data.addonsBreakdown.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Other Addons</h2>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5' }}>
                <th className="border border-border p-1 text-left">Addon</th>
                <th className="border border-border p-1 text-right">Quantity</th>
                <th className="border border-border p-1 text-right">Price per Unit ({data.currency})</th>
                <th className="border border-border p-1 text-right">Total ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {data.addonsBreakdown.map((addon, idx) => (
                <tr key={idx}>
                  <td className="border border-border p-1">{addon.addonName}</td>
                  <td className="border border-border p-1 text-right">{addon.quantity || '-'}</td>
                  <td className="border border-border p-1 text-right">
                    {addon.pricePerUnit ? formatCurrency(addon.pricePerUnit) : '-'}
                  </td>
                  <td className="border border-border p-1 text-right font-medium">
                    {formatCurrency(addon.totalCost)}
                  </td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                <td className="border border-border p-1" colSpan={3}>Total:</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.addonsTotal || 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Discounted Assets (if applicable) */}
      {data.discountedAssetsBreakdown && data.discountedAssetsBreakdown.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3 text-purple-600 dark:text-purple-400">Discounted Assets</h2>
          <p className="text-xs text-muted-foreground mb-2">
            These assets have special discounted rates and are excluded from standard calculations.
          </p>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5' }}>
                <th className="border border-border p-1 text-left">Asset Name</th>
                <th className="border border-border p-1 text-right">MW</th>
                <th className="border border-border p-1 text-center">Pricing Type</th>
                <th className="border border-border p-1 text-right">Rate ({data.currency})</th>
                <th className="border border-border p-1 text-right">Cost ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {data.discountedAssetsBreakdown.map((asset, idx) => (
                <tr key={idx} style={{ backgroundColor: '#faf5ff' }}>
                  <td className="border border-border p-1">
                    {asset.assetName}
                    {asset.note && (
                      <span className="text-xs text-muted-foreground ml-1">({asset.note})</span>
                    )}
                  </td>
                  <td className="border border-border p-1 text-right">{asset.mw.toFixed(2)}</td>
                  <td className="border border-border p-1 text-center">
                    {asset.pricingType === 'annual' ? 'Annual Fixed' : 'Per MW'}
                  </td>
                  <td className="border border-border p-1 text-right">
                    {asset.pricingType === 'annual' 
                      ? formatCurrency(asset.rate) + '/yr'
                      : formatCurrency(asset.rate) + '/MW'
                    }
                  </td>
                  <td className="border border-border p-1 text-right font-medium">
                    {formatCurrency(asset.cost)}
                  </td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                <td className="border border-border p-1" colSpan={4}>Total Discounted Assets:</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.discountedAssetsTotal || 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Retainer Hours (if applicable) */}
      {data.retainerBreakdown && data.retainerBreakdown.totalCost > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Retainer Hours</h2>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr style={{ backgroundColor: '#f4f4f5' }}>
                <th className="border border-border p-1 text-left">Description</th>
                <th className="border border-border p-1 text-right">Hours</th>
                <th className="border border-border p-1 text-right">Hourly Rate ({data.currency})</th>
                <th className="border border-border p-1 text-right">Calculated</th>
                <th className="border border-border p-1 text-right">Minimum</th>
                <th className="border border-border p-1 text-right">Total ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-border p-1">Retainer (per period)</td>
                <td className="border border-border p-1 text-right">{data.retainerBreakdown.hours || '-'}</td>
                <td className="border border-border p-1 text-right">
                  {data.retainerBreakdown.hourlyRate ? formatCurrency(data.retainerBreakdown.hourlyRate) : '-'}
                </td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.retainerBreakdown.calculatedCost)}</td>
                <td className="border border-border p-1 text-right">
                  {data.retainerBreakdown.minimumValue ? formatCurrency(data.retainerBreakdown.minimumValue) : '-'}
                </td>
                <td className="border border-border p-1 text-right font-medium">
                  {formatCurrency(data.retainerBreakdown.totalCost)}
                  {data.retainerBreakdown.minimumApplied && " *"}
                </td>
              </tr>
            </tbody>
          </table>
          {data.retainerBreakdown.minimumApplied && (
            <p className="text-xs text-muted-foreground mt-1">* Minimum value applied</p>
          )}
        </section>
      )}

      {/* Asset Breakdown - only show if there are assets */}
      {data.assetBreakdown && data.assetBreakdown.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Monitoring Fee Price Breakdown</h2>
          
          {/* Site minimum pricing summary if applicable */}
          {data.siteMinimumPricingSummary && (
            <div className="mb-3 p-2 rounded text-xs" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
              <p className="font-medium mb-1">Site Pricing Summary:</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span>Sites on Normal Pricing: </span>
                  <strong>{data.siteMinimumPricingSummary.sitesOnNormal} sites</strong>
                  <span className="ml-2 text-muted-foreground">({formatCurrency(data.siteMinimumPricingSummary.normalPricingTotal)}/yr)</span>
                </div>
                <div>
                  <span>Sites on Minimum Pricing: </span>
                  <strong>{data.siteMinimumPricingSummary.sitesOnMinimum} sites</strong>
                  <span className="ml-2 text-muted-foreground">({formatCurrency(data.siteMinimumPricingSummary.minimumPricingTotal)}/yr)</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            {(() => {
              const hasPricingModel = data.assetBreakdown.some(a => a.pricingModel);
              const minPricingCol = !!data.siteMinimumPricingSummary;
              const labelColSpan = 7 + (minPricingCol ? 1 : 0) + (hasPricingModel ? 1 : 0) + 1; // up to €/kWp
              return (
            <table className="w-full border-collapse border border-border" style={{ fontSize: '8px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f4f4f5' }}>
                  <th className="border border-border px-1 py-0.5 text-left">Asset Name</th>
                  <th className="border border-border px-1 py-0.5 text-right">kWp</th>
                  <th className="border border-border px-1 py-0.5 text-center">Hybrid</th>
                  <th className="border border-border px-1 py-0.5 text-center">Hub</th>
                  <th className="border border-border px-1 py-0.5 text-center">Portal</th>
                  <th className="border border-border px-1 py-0.5 text-center">Control</th>
                  <th className="border border-border px-1 py-0.5 text-center">Report</th>
                  {minPricingCol && (
                    <th className="border border-border px-1 py-0.5 text-center">Pricing</th>
                  )}
                  {hasPricingModel && (
                    <th className="border border-border px-1 py-0.5 text-center">Model</th>
                  )}
                  <th className="border border-border px-1 py-0.5 text-right">€/kWp</th>
                  <th className="border border-border px-1 py-0.5 text-right">€/Year</th>
                </tr>
              </thead>
              <tbody>
                {data.assetBreakdown.map((asset, idx) => (
                  <tr key={idx} style={asset.usesMinimum ? { backgroundColor: '#fffbeb' } : undefined}>
                    <td className="border border-border px-1 py-0.5" title={asset.assetId}>{asset.assetName}</td>
                    <td className="border border-border px-1 py-0.5 text-right">{asset.pvCapacityKWp.toFixed(1)}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.isHybrid ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.hubActive ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.portalActive ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.controlActive ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.reportingActive ? 'Y' : '-'}</td>
                    {minPricingCol && (
                      <td className="border border-border px-1 py-0.5 text-center font-medium" style={{ color: asset.usesMinimum ? '#ea580c' : '#16a34a' }}>
                        {asset.usesMinimum ? 'Min' : 'kWp'}
                      </td>
                    )}
                    {hasPricingModel && (
                      <td className="border border-border px-1 py-0.5 text-center font-medium" style={{ color: asset.pricingModel === 'irradiance' ? '#2563eb' : '#16a34a' }}>
                        {asset.pricingModel === 'irradiance' ? 'Irradiance' : asset.pricingModel === 'performance' ? 'Performance' : '-'}
                      </td>
                    )}
                    <td className="border border-border px-1 py-0.5 text-right">{asset.pricePerKWp.toFixed(2)}</td>
                    <td className="border border-border px-1 py-0.5 text-right font-medium">
                      {formatCurrency(asset.pricePerYear)}
                    </td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                  <td className="border border-border px-1 py-0.5" colSpan={labelColSpan}>Subtotal (Annual):</td>
                  <td className="border border-border px-1 py-0.5 text-right">{formatCurrency(data.assetBreakdownTotal)}</td>
                </tr>
                {data.minimumContractAdjustment > 0 && data.minimumAnnualValue && (
                  <>
                    <tr style={{ backgroundColor: '#fffbeb' }}>
                      <td className="border border-border px-1 py-0.5" colSpan={labelColSpan}>
                        Minimum Contract Adjustment (Annual):
                      </td>
                      <td className="border border-border px-1 py-0.5 text-right font-medium" style={{ color: '#d97706' }}>
                        {formatCurrency(data.minimumAnnualValue - data.assetBreakdownTotal)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#f4f4f5' }} className="font-bold">
                      <td className="border border-border px-1 py-0.5" colSpan={labelColSpan}>
                        Total with Minimum (Annual):
                      </td>
                      <td className="border border-border px-1 py-0.5 text-right">{formatCurrency(data.minimumAnnualValue)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
              );
            })()}
          </div>
          {data.siteMinimumPricingSummary && (
            <p className="text-muted-foreground mt-1" style={{ fontSize: '7px' }}>
              Pricing: <span style={{ color: '#16a34a' }} className="font-medium">kWp</span> = per-kWp rate, 
              <span style={{ color: '#ea580c' }} className="font-medium ml-1">Min</span> = minimum site fee (highlighted rows)
            </p>
          )}
        </section>
      )}

      {/* Validation Summary with Detailed Breakdown */}
      <section className="mt-6 p-3 border rounded-lg" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
        <h3 className="font-bold mb-2 text-xs">Calculation Breakdown</h3>
        
        {/* Detailed breakdown */}
        {data.calculationBreakdown && (
          <div className="mb-3 text-xs space-y-1 font-mono">
            {/* Show site minimum pricing breakdown if available */}
            {data.siteMinimumPricingSummary ? (
              <>
                <div className="flex justify-between">
                  <span>Sites on Normal Pricing ({data.siteMinimumPricingSummary.sitesOnNormal} sites):</span>
                  <span>{formatCurrency(data.siteMinimumPricingSummary.normalPricingTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Sites on Minimum Pricing ({data.siteMinimumPricingSummary.sitesOnMinimum} sites):</span>
                  <span>{formatCurrency(data.siteMinimumPricingSummary.minimumPricingTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                  <span>= Asset/Module Subtotal (annual):</span>
                  <span>{formatCurrency(data.assetBreakdownTotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>  × Billing Period:</span>
                  <span>{formatCurrency(data.calculationBreakdown.assetBreakdownPeriod)}</span>
                </div>
              </>
            ) : data.elumInternalBreakdown ? (
              <div className="flex justify-between">
                <span>Elum Internal Graduated Tiers ({data.elumInternalBreakdown.totalMW.toFixed(2)} MW):</span>
                <span>{formatCurrency(data.elumInternalBreakdown.totalCost)}</span>
              </div>
            ) : data.elumJubailiBreakdown ? (
              <div className="flex justify-between">
                <span>Elum Jubaili Per-Site ({data.elumJubailiBreakdown.siteCount} sites):</span>
                <span>{formatCurrency(data.elumJubailiBreakdown.totalCost)}</span>
              </div>
            ) : data.elumEpmBreakdown ? (
              <>
                <div className="flex justify-between">
                  <span>Elum ePM Small Sites ({data.elumEpmBreakdown.smallSitesCount} sites):</span>
                  <span>{formatCurrency(data.elumEpmBreakdown.smallSitesTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Elum ePM Large Sites ({data.elumEpmBreakdown.largeSitesCount} sites):</span>
                  <span>{formatCurrency(data.elumEpmBreakdown.largeSitesTotal)}</span>
                </div>
              </>
            ) : data.perSiteBreakdown ? (
              <>
                {data.perSiteBreakdown.onboardingCost > 0 && (
                  <div className="flex justify-between">
                    <span>Onboarding Fees ({data.perSiteBreakdown.sitesOnboarded} sites):</span>
                    <span>{formatCurrency(data.perSiteBreakdown.onboardingCost)}</span>
                  </div>
                )}
                {data.perSiteBreakdown.annualSubscriptionCost > 0 && (
                  <div className="flex justify-between">
                    <span>+ Annual Subscriptions ({data.perSiteBreakdown.sitesRenewed} sites):</span>
                    <span>{formatCurrency(data.perSiteBreakdown.annualSubscriptionCost)}</span>
                  </div>
                )}
              </>
            ) : data.perMWAnnualUpfrontBreakdown ? (
              data.perMWAnnualUpfrontBreakdown.cycleType === 'annual_upfront' ? (
                <div className="flex justify-between">
                  <span>Annual Platform Fee — Minimum:</span>
                  <span>{formatCurrency(data.perMWAnnualUpfrontBreakdown.annualFloor)}</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span>Per-MW Quarterly Overage:</span>
                  <span>{formatCurrency(data.perMWAnnualUpfrontBreakdown.overageAmount)}</span>
                </div>
              )
            ) : data.spsAnnualUpfrontBreakdown ? (
              data.spsAnnualUpfrontBreakdown.cycleType === 'annual_upfront' ? (
                <div className="flex justify-between">
                  <span>Annual Platform Fee — Upfront:</span>
                  <span>{formatCurrency(data.spsAnnualUpfrontBreakdown.annualUpfrontAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Quarterly SPS Fee:</span>
                    <span>{formatCurrency(data.spsAnnualUpfrontBreakdown.quarterCost)}</span>
                  </div>
                  {data.spsAnnualUpfrontBreakdown.creditApplied > 0 && (
                    <div className="flex justify-between" style={{ color: '#d97706' }}>
                      <span>− Annual Minimum Already Paid:</span>
                      <span>−{formatCurrency(data.spsAnnualUpfrontBreakdown.creditApplied)}</span>
                    </div>
                  )}
                </>
              )
            ) : (
              data.calculationBreakdown.assetBreakdownPeriod > 0 && (
                <div className="flex justify-between">
                  <span>Asset Breakdown (period):</span>
                  <span>{formatCurrency(data.calculationBreakdown.assetBreakdownPeriod)}</span>
                </div>
              )
            )}
            {data.calculationBreakdown.minimumCharges > 0 && (
              <div className="flex justify-between">
                <span>+ Minimum Charges:</span>
                <span>{formatCurrency(data.calculationBreakdown.minimumCharges)}</span>
              </div>
            )}
            {data.calculationBreakdown.minimumContractAdjustment > 0 && (
              <div className="flex justify-between font-medium" style={{ color: '#d97706' }}>
                <span>+ Min. Contract Adjustment:</span>
                <span>{formatCurrency(data.calculationBreakdown.minimumContractAdjustment)}</span>
              </div>
            )}
            {data.calculationBreakdown.baseMonthlyPrice > 0 && (
              <div className="flex justify-between">
                <span>+ Base Monthly Price:</span>
                <span>{formatCurrency(data.calculationBreakdown.baseMonthlyPrice)}</span>
              </div>
            )}
            {data.calculationBreakdown.retainerCost > 0 && (
              <div className="flex justify-between">
                <span>+ Retainer Hours:</span>
                <span>{formatCurrency(data.calculationBreakdown.retainerCost)}</span>
              </div>
            )}
            {data.calculationBreakdown.discountedAssetsTotal > 0 && (
              <div className="flex justify-between" style={{ color: '#9333ea' }}>
                <span>+ Discounted Assets:</span>
                <span>{formatCurrency(data.calculationBreakdown.discountedAssetsTotal)}</span>
              </div>
            )}
            {data.calculationBreakdown.addonsTotal > 0 && (
              <div className="flex justify-between">
                <span>+ Addons Total:</span>
                <span>{formatCurrency(data.calculationBreakdown.addonsTotal)}</span>
              </div>
            )}
            {data.calculationBreakdown.fixedPackageCost > 0 && (
              <div className="flex justify-between" style={{ color: '#0891b2' }}>
                <span>+ Fixed Package Fee:</span>
                <span>{formatCurrency(data.calculationBreakdown.fixedPackageCost)}</span>
              </div>
            )}
            {data.spsAnnualUpfrontBreakdown?.cycleType === 'quarterly_with_credit'
              && data.spsAnnualUpfrontBreakdown.creditApplied > 0 && (
              <div className="flex justify-between" style={{ color: '#d97706' }}>
                <span>− Prepaid Credit Applied:</span>
                <span>−{formatCurrency(data.spsAnnualUpfrontBreakdown.creditApplied)}</span>
              </div>
            )}
            <div className="border-t border-border pt-1 mt-1 flex justify-between font-bold">
              <span>= Support Document Total:</span>
              <span>{formatCurrency(data.calculatedTotal)}</span>
            </div>

          </div>
        )}
        
        {/* Comparison */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-2">
          <div>
            <p><strong>Invoice Total:</strong> {formatCurrency(data.invoiceTotal)}</p>
          </div>
          <div>
            {data.totalsMatch ? (
              <p style={{ color: '#16a34a' }} className="font-medium">✓ Totals Match</p>
            ) : (
              <div>
                <p className="text-destructive font-medium">⚠ Totals Mismatch</p>
                <p className="text-muted-foreground text-[9px]">
                  Difference: {formatCurrency(Math.abs(data.calculatedTotal - data.invoiceTotal))}
                </p>
              </div>
            )}
          </div>
        </div>
        {data.whtGrossUpRate && data.whtGrossUpRate > 0 && (
          <p className="mt-2 text-[10px] italic text-muted-foreground">
            Note: Amounts sent to Xero are grossed up by {(data.whtGrossUpRate * 100).toFixed(2)}%
            to offset withholding tax deducted by the customer at payment. The figures above show
            the pre-gross-up economics.
          </p>
        )}
      </section>
    </div>
  );
}
