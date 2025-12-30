/**
 * Reports Export Utility
 * Generates Excel exports for financial reports
 */

import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export interface MonthlyExportData {
  month: string;
  monthKey: string;
  forecast: number;
  actual: number;
  actualARR: number;
  actualNRR: number;
}

export interface CustomerExportData {
  name: string;
  totalRevenue: number;
  arr: number;
  nrr: number;
  contractARR: number;
}

export interface SummaryExportData {
  totalForecast: number;
  totalActual: number;
  totalARR: number;
  totalNRR: number;
  contractARR: number;
  arrPercentage: number;
}

export interface ReportExportData {
  year: number;
  currency: string;
  monthlyData: MonthlyExportData[];
  customerData: CustomerExportData[];
  summaryData: SummaryExportData;
}

/**
 * Export reports data to Excel file
 */
export function exportReportsToExcel(data: ReportExportData): void {
  const workbook = XLSX.utils.book_new();
  const currencySymbol = data.currency === 'USD' ? '$' : '€';

  // Sheet 1: Summary
  const summaryRows = [
    ['Financial Report Summary'],
    [],
    ['Report Year', data.year],
    ['Currency', data.currency],
    [],
    ['Metric', 'Value'],
    ['Total Forecast Revenue', formatAmount(data.summaryData.totalForecast, currencySymbol)],
    ['Total Actual Revenue', formatAmount(data.summaryData.totalActual, currencySymbol)],
    ['Invoice ARR (Platform Fees)', formatAmount(data.summaryData.totalARR, currencySymbol)],
    ['Invoice NRR (Implementation)', formatAmount(data.summaryData.totalNRR, currencySymbol)],
    ['Contract ARR', formatAmount(data.summaryData.contractARR, currencySymbol)],
    ['ARR % of Total', `${data.summaryData.arrPercentage}%`],
    [],
    ['Variance (Actual - Forecast)', formatAmount(data.summaryData.totalActual - data.summaryData.totalForecast, currencySymbol)],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  setColumnWidths(summarySheet, [30, 25]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Sheet 2: Monthly Breakdown
  const monthlyHeaders = ['Month', 'Forecast', 'Actual', 'ARR', 'NRR', 'Variance'];
  const monthlyRows = data.monthlyData.map(m => [
    m.month,
    formatAmount(m.forecast, currencySymbol),
    formatAmount(m.actual, currencySymbol),
    formatAmount(m.actualARR, currencySymbol),
    formatAmount(m.actualNRR, currencySymbol),
    formatAmount(m.actual - m.forecast, currencySymbol),
  ]);

  // Add totals row
  const monthlyTotals = [
    'TOTAL',
    formatAmount(data.monthlyData.reduce((sum, m) => sum + m.forecast, 0), currencySymbol),
    formatAmount(data.monthlyData.reduce((sum, m) => sum + m.actual, 0), currencySymbol),
    formatAmount(data.monthlyData.reduce((sum, m) => sum + m.actualARR, 0), currencySymbol),
    formatAmount(data.monthlyData.reduce((sum, m) => sum + m.actualNRR, 0), currencySymbol),
    formatAmount(
      data.monthlyData.reduce((sum, m) => sum + m.actual, 0) - 
      data.monthlyData.reduce((sum, m) => sum + m.forecast, 0),
      currencySymbol
    ),
  ];

  const monthlySheet = XLSX.utils.aoa_to_sheet([monthlyHeaders, ...monthlyRows, [], monthlyTotals]);
  setColumnWidths(monthlySheet, [12, 15, 15, 15, 15, 15]);
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly Breakdown');

  // Sheet 3: Customer Revenue
  const customerHeaders = ['Customer', 'Total Revenue', 'Invoice ARR', 'Invoice NRR', 'Contract ARR', 'ARR %'];
  const customerRows = data.customerData.map(c => {
    const arrPercent = c.totalRevenue > 0 ? Math.round((c.arr / c.totalRevenue) * 100) : 0;
    return [
      c.name,
      formatAmount(c.totalRevenue, currencySymbol),
      formatAmount(c.arr, currencySymbol),
      formatAmount(c.nrr, currencySymbol),
      formatAmount(c.contractARR, currencySymbol),
      `${arrPercent}%`,
    ];
  });

  // Add totals row
  const totalRevenue = data.customerData.reduce((sum, c) => sum + c.totalRevenue, 0);
  const totalARR = data.customerData.reduce((sum, c) => sum + c.arr, 0);
  const totalNRR = data.customerData.reduce((sum, c) => sum + c.nrr, 0);
  const totalContractARR = data.customerData.reduce((sum, c) => sum + c.contractARR, 0);
  const overallARRPercent = totalRevenue > 0 ? Math.round((totalARR / totalRevenue) * 100) : 0;

  const customerTotals = [
    'TOTAL',
    formatAmount(totalRevenue, currencySymbol),
    formatAmount(totalARR, currencySymbol),
    formatAmount(totalNRR, currencySymbol),
    formatAmount(totalContractARR, currencySymbol),
    `${overallARRPercent}%`,
  ];

  const customerSheet = XLSX.utils.aoa_to_sheet([customerHeaders, ...customerRows, [], customerTotals]);
  setColumnWidths(customerSheet, [30, 18, 18, 18, 18, 10]);
  XLSX.utils.book_append_sheet(workbook, customerSheet, 'Customer Revenue');

  // Generate filename
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const filename = `Financial_Report_${data.year}_${dateStr}.xlsx`;

  // Download file
  XLSX.writeFile(workbook, filename);
}

/**
 * Format amount with currency symbol
 */
function formatAmount(amount: number, currencySymbol: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currencySymbol}${formatted}`;
}

/**
 * Set column widths for Excel sheet
 */
function setColumnWidths(sheet: XLSX.WorkSheet, widths: number[]): void {
  sheet['!cols'] = widths.map(w => ({ wch: w }));
}
