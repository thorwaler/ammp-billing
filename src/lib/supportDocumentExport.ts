import * as XLSX from 'xlsx';
import { SupportDocumentData } from './supportDocumentGenerator';
import { format } from 'date-fns';

export type ExportFormat = 'xlsx' | 'pdf' | 'both';

/**
 * Export support document as Excel file
 */
export function exportToExcel(data: SupportDocumentData, filename: string) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Year Overview
  const yearOverviewData = [
    ['Period', 'Monitoring Fee', 'Solcast Fee', 'Additional Work', `Total (${data.currency})`],
    ...data.yearInvoices.map(inv => [
      inv.period,
      inv.monitoringFee,
      inv.solcastFee,
      inv.additionalWork,
      inv.total
    ]),
    ['', '', '', 'Year Total:', data.yearTotal]
  ];
  const wsYearOverview = XLSX.utils.aoa_to_sheet(yearOverviewData);
  XLSX.utils.book_append_sheet(workbook, wsYearOverview, 'Year Overview');

  // Sheet 2: Asset Breakdown
  const assetBreakdownData = [
    [
      'Asset ID',
      'Asset Name',
      'PV Capacity (kWp)',
      'PV',
      'Hybrid',
      'Hub',
      'Portal',
      'Control',
      'Reporting',
      `Price per kWp (${data.currency})`,
      `Price per Year (${data.currency})`
    ],
    ...data.assetBreakdown.map(asset => [
      asset.assetId,
      asset.assetName,
      asset.pvCapacityKWp,
      asset.isPV ? 'Yes' : 'No',
      asset.isHybrid ? 'Yes' : 'No',
      asset.hubActive ? 'Yes' : 'No',
      asset.portalActive ? 'Yes' : 'No',
      asset.controlActive ? 'Yes' : 'No',
      asset.reportingActive ? 'Yes' : 'No',
      asset.pricePerKWp,
      asset.pricePerYear
    ]),
    ['', '', '', '', '', '', '', '', '', 'Total:', data.assetBreakdownTotal]
  ];
  const wsAssetBreakdown = XLSX.utils.aoa_to_sheet(assetBreakdownData);
  XLSX.utils.book_append_sheet(workbook, wsAssetBreakdown, 'Asset Breakdown');

  // Sheet 3: Solcast (if applicable)
  if (data.solcastBreakdown && data.solcastBreakdown.length > 0) {
    const solcastData = [
      ['Month', 'Number of Sites', `Price per Site (${data.currency})`, `Total (${data.currency})`],
      ...data.solcastBreakdown.map(item => [
        item.month,
        item.siteCount,
        item.pricePerSite,
        item.totalPerMonth
      ]),
      ['', '', 'Total:', data.solcastTotal || 0]
    ];
    const wsSolcast = XLSX.utils.aoa_to_sheet(solcastData);
    XLSX.utils.book_append_sheet(workbook, wsSolcast, 'Solcast');
  }

  // Sheet 4: Other Addons (if applicable)
  if (data.addonsBreakdown && data.addonsBreakdown.length > 0) {
    const addonsData = [
      ['Addon', 'Quantity', `Price per Unit (${data.currency})`, `Total (${data.currency})`],
      ...data.addonsBreakdown.map(addon => [
        addon.addonName,
        addon.quantity || '-',
        addon.pricePerUnit || '-',
        addon.totalCost
      ]),
      ['', '', 'Total:', data.addonsTotal || 0]
    ];
    const wsAddons = XLSX.utils.aoa_to_sheet(addonsData);
    XLSX.utils.book_append_sheet(workbook, wsAddons, 'Other Addons');
  }

  // Export file
  XLSX.writeFile(workbook, filename);
}

/**
 * Export support document as PDF using browser print
 */
export function exportToPDF(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Element not found for PDF export');
    return;
  }

  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    console.error('Failed to open print window');
    return;
  }

  // Get all styles from the current document
  const styles = Array.from(document.styleSheets)
    .map(styleSheet => {
      try {
        return Array.from(styleSheet.cssRules)
          .map(rule => rule.cssText)
          .join('\n');
      } catch (e) {
        // Handle cross-origin stylesheets
        return '';
      }
    })
    .join('\n');

  // Write content to print window
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        <style>
          ${styles}
          @media print {
            body { margin: 0; padding: 20px; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  
  // Wait for content to load, then print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    setTimeout(() => printWindow.close(), 500);
  };
}

/**
 * Generate filename for support document exports
 */
export function generateFilename(customerName: string, invoicePeriod: string, extension: 'pdf' | 'xlsx'): string {
  const sanitizedName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedPeriod = invoicePeriod.replace(/[^a-zA-Z0-9]/g, '_');
  return `${sanitizedName}_Invoice_Support_${sanitizedPeriod}.${extension}`;
}
