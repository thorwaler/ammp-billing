import { SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { format } from "date-fns";

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
            <p><strong>Date:</strong> {format(data.invoiceDate, 'dd MMM yyyy')}</p>
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
            <tr className="bg-muted">
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
            <tr className="bg-muted font-bold">
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
          <h2 className="text-base font-bold mb-3">Elum Jubaili Pricing Breakdown</h2>
          <div className="text-sm mb-3">
            <p><strong>Per-Site Annual Fee:</strong> {formatCurrency(data.elumJubailiBreakdown.perSiteFee)}</p>
            <p><strong>Site Count:</strong> {data.elumJubailiBreakdown.siteCount}</p>
            <p><strong>Total Cost:</strong> {formatCurrency(data.elumJubailiBreakdown.totalCost)}</p>
          </div>
        </section>
      )}

      {/* Elum Internal Breakdown (if applicable) */}
      {data.elumInternalBreakdown && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Elum Internal Assets - Graduated Tier Pricing</h2>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr className="bg-muted">
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
              <tr className="bg-muted font-bold">
                <td className="border border-border p-1">Total</td>
                <td className="border border-border p-1 text-right">{data.elumInternalBreakdown.totalMW.toFixed(2)}</td>
                <td className="border border-border p-1"></td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.elumInternalBreakdown.totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Solcast Tracking (if applicable) */}
      {data.solcastBreakdown && data.solcastBreakdown.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-3">Solcast Fee Breakdown</h2>
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr className="bg-muted">
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
              <tr className="bg-muted font-bold">
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
              <tr className="bg-muted">
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
              <tr className="bg-muted font-bold">
                <td className="border border-border p-1" colSpan={3}>Total:</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.addonsTotal || 0)}</td>
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
              <tr className="bg-muted">
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
            <div className="mb-3 p-2 bg-muted/50 rounded text-xs">
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
            <table className="w-full border-collapse border border-border" style={{ fontSize: '8px' }}>
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border px-1 py-0.5 text-left">Asset Name</th>
                  <th className="border border-border px-1 py-0.5 text-right">kWp</th>
                  <th className="border border-border px-1 py-0.5 text-center">Hybrid</th>
                  <th className="border border-border px-1 py-0.5 text-center">Hub</th>
                  <th className="border border-border px-1 py-0.5 text-center">Portal</th>
                  <th className="border border-border px-1 py-0.5 text-center">Control</th>
                  <th className="border border-border px-1 py-0.5 text-center">Report</th>
                  {data.siteMinimumPricingSummary && (
                    <th className="border border-border px-1 py-0.5 text-center">Pricing</th>
                  )}
                  <th className="border border-border px-1 py-0.5 text-right">€/kWp</th>
                  <th className="border border-border px-1 py-0.5 text-right">€/Year</th>
                </tr>
              </thead>
              <tbody>
                {data.assetBreakdown.map((asset, idx) => (
                  <tr key={idx} className={asset.usesMinimum ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                    <td className="border border-border px-1 py-0.5" title={asset.assetId}>{asset.assetName}</td>
                    <td className="border border-border px-1 py-0.5 text-right">{asset.pvCapacityKWp.toFixed(1)}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.isHybrid ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.hubActive ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.portalActive ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.controlActive ? 'Y' : '-'}</td>
                    <td className="border border-border px-1 py-0.5 text-center">{asset.reportingActive ? 'Y' : '-'}</td>
                    {data.siteMinimumPricingSummary && (
                      <td className={`border border-border px-1 py-0.5 text-center font-medium ${asset.usesMinimum ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                        {asset.usesMinimum ? 'Min' : 'kWp'}
                      </td>
                    )}
                    <td className="border border-border px-1 py-0.5 text-right">{asset.pricePerKWp.toFixed(2)}</td>
                    <td className="border border-border px-1 py-0.5 text-right font-medium">
                      {formatCurrency(asset.pricePerYear)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted font-bold">
                  <td className="border border-border px-1 py-0.5" colSpan={data.siteMinimumPricingSummary ? 9 : 8}>Total:</td>
                  <td className="border border-border px-1 py-0.5 text-right">{formatCurrency(data.assetBreakdownTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {data.siteMinimumPricingSummary && (
            <p className="text-muted-foreground mt-1" style={{ fontSize: '7px' }}>
              Pricing: <span className="text-green-600 dark:text-green-400 font-medium">kWp</span> = per-kWp rate, 
              <span className="text-orange-600 dark:text-orange-400 font-medium ml-1">Min</span> = minimum site fee (highlighted rows)
            </p>
          )}
        </section>
      )}

      {/* Validation Summary with Detailed Breakdown */}
      <section className="mt-6 p-3 border rounded-lg bg-muted/50">
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
              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
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
            {data.calculationBreakdown.addonsTotal > 0 && (
              <div className="flex justify-between">
                <span>+ Addons Total:</span>
                <span>{formatCurrency(data.calculationBreakdown.addonsTotal)}</span>
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
              <p className="text-green-600 dark:text-green-400 font-medium">✓ Totals Match</p>
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
      </section>
    </div>
  );
}
