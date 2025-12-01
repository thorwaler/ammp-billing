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

      {/* Asset Breakdown */}
      <section className="mb-6">
        <h2 className="text-base font-bold mb-3">Monitoring Fee Price Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-border text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border p-1 text-left">Asset ID</th>
                <th className="border border-border p-1 text-left">Asset Name</th>
                <th className="border border-border p-1 text-right">PV Capacity (kWp)</th>
                <th className="border border-border p-1 text-center">PV</th>
                <th className="border border-border p-1 text-center">Hybrid</th>
                <th className="border border-border p-1 text-center">Hub</th>
                <th className="border border-border p-1 text-center">Portal</th>
                <th className="border border-border p-1 text-center">Control</th>
                <th className="border border-border p-1 text-center">Reporting</th>
                <th className="border border-border p-1 text-right">Price per kWp ({data.currency})</th>
                <th className="border border-border p-1 text-right">Price per Year ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {data.assetBreakdown.map((asset, idx) => (
                <tr key={idx}>
                  <td className="border border-border p-1">{asset.assetId}</td>
                  <td className="border border-border p-1">{asset.assetName}</td>
                  <td className="border border-border p-1 text-right">{asset.pvCapacityKWp.toFixed(2)}</td>
                  <td className="border border-border p-1 text-center">{asset.isPV ? 'Yes' : 'No'}</td>
                  <td className="border border-border p-1 text-center">{asset.isHybrid ? 'Yes' : 'No'}</td>
                  <td className="border border-border p-1 text-center">{asset.hubActive ? 'Yes' : 'No'}</td>
                  <td className="border border-border p-1 text-center">{asset.portalActive ? 'Yes' : 'No'}</td>
                  <td className="border border-border p-1 text-center">{asset.controlActive ? 'Yes' : 'No'}</td>
                  <td className="border border-border p-1 text-center">{asset.reportingActive ? 'Yes' : 'No'}</td>
                  <td className="border border-border p-1 text-right">{asset.pricePerKWp.toFixed(2)}</td>
                  <td className="border border-border p-1 text-right font-medium">{formatCurrency(asset.pricePerYear)}</td>
                </tr>
              ))}
              <tr className="bg-muted font-bold">
                <td className="border border-border p-1" colSpan={10}>Total:</td>
                <td className="border border-border p-1 text-right">{formatCurrency(data.assetBreakdownTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Validation Summary */}
      <section className="mt-6 p-3 border rounded-lg bg-muted/50">
        <h3 className="font-bold mb-2 text-xs">Validation</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p><strong>Support Document Total:</strong> {formatCurrency(data.calculatedTotal)}</p>
            <p><strong>Invoice Total:</strong> {formatCurrency(data.invoiceTotal)}</p>
          </div>
          <div>
            {data.totalsMatch ? (
              <p className="text-green-600 dark:text-green-400 font-medium">✓ Totals Match</p>
            ) : (
              <p className="text-destructive font-medium">⚠ Totals Mismatch</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
