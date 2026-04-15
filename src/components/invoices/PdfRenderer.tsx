import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SupportDocumentData } from '@/lib/supportDocumentGenerator';
import { format } from 'date-fns';

const MARGIN = 14;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd MMM yyyy');
}

function ensureSpace(doc: jsPDF, needed: number, currentY: number): number {
  if (currentY + needed > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage();
    return 20;
  }
  return currentY;
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, 12, y);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN, y);
  return y + 6;
}

/**
 * Renders the SupportDocument data to a searchable PDF with real text.
 * Returns the PDF as a base64 string.
 */
export async function renderSupportDocumentToPdf(data: SupportDocumentData): Promise<string> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const cur = data.currency;
  let y = 20;

  // === HEADER ===
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Support Document', MARGIN, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const headerLeft = [
    `Customer: ${data.customerName}`,
    ...(data.contractName ? [`Contract: ${data.contractName}`] : []),
    `Invoice Period: ${data.invoicePeriod}`,
  ];
  const headerRight = [
    `Date: ${formatDate(data.invoiceDate)}`,
    `Currency: ${cur}`,
    ...(data.discountPercent > 0 ? [`Portfolio Discount: ${data.discountPercent}%`] : []),
  ];

  headerLeft.forEach((line, i) => {
    doc.text(line, MARGIN, y + i * 4.5);
  });
  headerRight.forEach((line, i) => {
    doc.text(line, PAGE_WIDTH / 2 + 10, y + i * 4.5);
  });
  y += Math.max(headerLeft.length, headerRight.length) * 4.5 + 4;

  // === YEAR OVERVIEW ===
  y = addSectionTitle(doc, 'Year-to-Date Invoice Summary', y);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Period', 'Monitoring Fee', 'Solcast Fee', 'Additional Work', `Total (${cur})`]],
    body: [
      ...data.yearInvoices.map(inv => [
        inv.period,
        fmt(inv.monitoringFee, cur),
        fmt(inv.solcastFee, cur),
        fmt(inv.additionalWork, cur),
        fmt(inv.total, cur),
      ]),
      [{ content: 'Year Total:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(data.yearTotal, cur), styles: { fontStyle: 'bold', halign: 'right' } }],
    ],
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // === ELUM EPM BREAKDOWN ===
  if (data.elumEpmBreakdown) {
    y = addSectionTitle(doc, 'Elum ePM Pricing Breakdown', y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const epm = data.elumEpmBreakdown;
    const lines = [
      `Site Size Threshold: ${epm.threshold} kWp`,
      `Small Sites (≤ threshold): ${epm.smallSitesCount} sites @ ${fmt(epm.belowThresholdRate, cur)}/MWp — Total: ${fmt(epm.smallSitesTotal, cur)}`,
      `Large Sites (> threshold): ${epm.largeSitesCount} sites @ ${fmt(epm.aboveThresholdRate, cur)}/MWp — Total: ${fmt(epm.largeSitesTotal, cur)}`,
      ...(epm.sitesUsingMinimum > 0 ? [`Sites Using Minimum Fee: ${epm.sitesUsingMinimum}`] : []),
    ];
    lines.forEach(l => { y = ensureSpace(doc, 5, y); doc.text(l, MARGIN, y); y += 4; });
    y += 2;
  }

  // === ELUM JUBAILI ===
  if (data.elumJubailiBreakdown) {
    y = addSectionTitle(doc, 'Elum Jubaili Pricing Breakdown', y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const jub = data.elumJubailiBreakdown;
    [`Per-Site Annual Fee: ${fmt(jub.perSiteFee, cur)}`, `Site Count: ${jub.siteCount}`, `Total Cost: ${fmt(jub.totalCost, cur)}`].forEach(l => {
      y = ensureSpace(doc, 5, y); doc.text(l, MARGIN, y); y += 4;
    });
    y += 2;
  }

  // === ELUM INTERNAL ===
  if (data.elumInternalBreakdown) {
    y = addSectionTitle(doc, 'Elum Internal Assets - Graduated Tier Pricing', y);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Tier', 'MW in Tier', `Price per MW (${cur})`, `Cost (${cur})`]],
      body: [
        ...data.elumInternalBreakdown.tiers.map(t => [t.label, t.mwInTier.toFixed(2), fmt(t.pricePerMW, cur), fmt(t.cost, cur)]),
        ['Total', data.elumInternalBreakdown.totalMW.toFixed(2), '', fmt(data.elumInternalBreakdown.totalCost, cur)],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === MATRIARCH API ===
  if (data.matriarchApiBreakdown) {
    const mat = data.matriarchApiBreakdown;
    y = addSectionTitle(doc, 'Matriarch API — Dual Subscription Breakdown', y);

    // Irradiance
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    y = ensureSpace(doc, 6, y); doc.text('1. Irradiance-Only Sites (Monthly Per-Site)', MARGIN, y); y += 5;
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      body: [
        ['Number of irradiance-only sites', String(mat.irradianceOnlySites)],
        ['Rate per site per month', fmt(mat.irradiancePerSiteRate, cur)],
        ['Monthly total', fmt(mat.irradianceMonthlyTotal, cur)],
        [{ content: 'Annual total', styles: { fontStyle: 'bold' } }, { content: fmt(mat.irradianceAnnualTotal, cur), styles: { fontStyle: 'bold' } }],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 1: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    // Performance
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    y = ensureSpace(doc, 6, y); doc.text('2. Asset Performance Sites (Annual Per-MWp, Graduated)', MARGIN, y); y += 5;
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Tier', 'MWp in Tier', 'Rate/MWp/yr', 'Cost']],
      body: [
        ...mat.performanceTierBreakdown.map(t => [t.label, t.mwInTier.toFixed(2), fmt(t.pricePerMWp, cur), fmt(t.cost, cur)]),
        [{ content: `Total (${mat.performanceSites} sites, ${mat.performanceTotalMWp.toFixed(2)} MWp)`, styles: { fontStyle: 'bold' } }, '', '', { content: fmt(mat.performanceAnnualTotal, cur), styles: { fontStyle: 'bold' } }],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    y = ensureSpace(doc, 6, y);
    doc.text(`Combined Annual Total: ${fmt(mat.totalAnnualCost, cur)}`, MARGIN, y);
    y += 6;
  }

  // === PER-SITE BREAKDOWN ===
  if (data.perSiteBreakdown && (data.perSiteBreakdown.onboardingCost > 0 || data.perSiteBreakdown.annualSubscriptionCost > 0)) {
    const ps = data.perSiteBreakdown;
    y = addSectionTitle(doc, 'Per-Site Billing Breakdown', y);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    [
      `Onboarding Fee per Site: ${fmt(ps.onboardingFeePerSite, cur)} — Sites: ${ps.sitesOnboarded} — Total: ${fmt(ps.onboardingCost, cur)}`,
      `Annual Fee per Site: ${fmt(ps.annualFeePerSite, cur)} — Sites: ${ps.sitesRenewed} — Total: ${fmt(ps.annualSubscriptionCost, cur)}`,
    ].forEach(l => { y = ensureSpace(doc, 5, y); doc.text(l, MARGIN, y); y += 4; });
    y += 2;

    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Site Name', 'Capacity (kWp)', 'Onboarding Date', 'Type', `Amount (${cur})`]],
      body: [
        ...ps.siteBreakdown.map(s => [
          s.assetName,
          s.capacityKwp?.toFixed(1) || '-',
          s.onboardingDate ? formatDate(s.onboardingDate) : '-',
          s.isOnboarding && s.isRenewal ? 'Onboarding + Renewal' : s.isOnboarding ? 'Onboarding' : 'Annual Renewal',
          fmt(s.fee, cur),
        ]),
        [{ content: 'Total:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(ps.onboardingCost + ps.annualSubscriptionCost, cur), styles: { fontStyle: 'bold', halign: 'right' } }],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 4: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === SOLCAST ===
  if (data.solcastBreakdown && data.solcastBreakdown.length > 0) {
    y = addSectionTitle(doc, 'Solcast Fee Breakdown', y);
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Month', 'Number of Sites', `Price per Site (${cur})`, `Total (${cur})`]],
      body: [
        ...data.solcastBreakdown.map(s => [s.month, String(s.siteCount), fmt(s.pricePerSite, cur), fmt(s.totalPerMonth, cur)]),
        [{ content: 'Total:', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(data.solcastTotal || 0, cur), styles: { fontStyle: 'bold', halign: 'right' } }],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === OTHER ADDONS ===
  if (data.addonsBreakdown && data.addonsBreakdown.length > 0) {
    y = addSectionTitle(doc, 'Other Addons', y);
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Addon', 'Quantity', `Price per Unit (${cur})`, `Total (${cur})`]],
      body: [
        ...data.addonsBreakdown.map(a => [a.addonName, a.quantity ? String(a.quantity) : '-', a.pricePerUnit ? fmt(a.pricePerUnit, cur) : '-', fmt(a.totalCost, cur)]),
        [{ content: 'Total:', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(data.addonsTotal || 0, cur), styles: { fontStyle: 'bold', halign: 'right' } }],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === DISCOUNTED ASSETS ===
  if (data.discountedAssetsBreakdown && data.discountedAssetsBreakdown.length > 0) {
    y = addSectionTitle(doc, 'Discounted Assets', y);
    doc.setFontSize(7); doc.setFont('helvetica', 'italic');
    y = ensureSpace(doc, 5, y);
    doc.text('These assets have special discounted rates and are excluded from standard calculations.', MARGIN, y);
    y += 4;
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Asset Name', 'MW', 'Pricing Type', `Rate (${cur})`, `Cost (${cur})`]],
      body: [
        ...data.discountedAssetsBreakdown.map(a => [
          a.assetName + (a.note ? ` (${a.note})` : ''),
          a.mw.toFixed(2),
          a.pricingType === 'annual' ? 'Annual Fixed' : 'Per MW',
          a.pricingType === 'annual' ? fmt(a.rate, cur) + '/yr' : fmt(a.rate, cur) + '/MW',
          fmt(a.cost, cur),
        ]),
        [{ content: 'Total Discounted Assets:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(data.discountedAssetsTotal || 0, cur), styles: { fontStyle: 'bold', halign: 'right' } }],
      ],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 4: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === RETAINER ===
  if (data.retainerBreakdown && data.retainerBreakdown.totalCost > 0) {
    y = addSectionTitle(doc, 'Retainer Hours', y);
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [['Description', 'Hours', `Hourly Rate (${cur})`, 'Calculated', 'Minimum', `Total (${cur})`]],
      body: [[
        'Retainer (per period)',
        data.retainerBreakdown.hours ? String(data.retainerBreakdown.hours) : '-',
        data.retainerBreakdown.hourlyRate ? fmt(data.retainerBreakdown.hourlyRate, cur) : '-',
        fmt(data.retainerBreakdown.calculatedCost, cur),
        data.retainerBreakdown.minimumValue ? fmt(data.retainerBreakdown.minimumValue, cur) : '-',
        fmt(data.retainerBreakdown.totalCost, cur) + (data.retainerBreakdown.minimumApplied ? ' *' : ''),
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY;
    if (data.retainerBreakdown.minimumApplied) {
      y += 2; doc.setFontSize(6); doc.setFont('helvetica', 'italic');
      doc.text('* Minimum value applied', MARGIN, y);
    }
    y += 6;
  }

  // === ASSET BREAKDOWN ===
  if (data.assetBreakdown && data.assetBreakdown.length > 0) {
    y = addSectionTitle(doc, 'Monitoring Fee Price Breakdown', y);

    // Site minimum summary
    if (data.siteMinimumPricingSummary) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      y = ensureSpace(doc, 8, y);
      doc.text(`Sites on Normal Pricing: ${data.siteMinimumPricingSummary.sitesOnNormal} (${fmt(data.siteMinimumPricingSummary.normalPricingTotal, cur)}/yr)`, MARGIN, y);
      y += 3.5;
      doc.text(`Sites on Minimum Pricing: ${data.siteMinimumPricingSummary.sitesOnMinimum} (${fmt(data.siteMinimumPricingSummary.minimumPricingTotal, cur)}/yr)`, MARGIN, y);
      y += 5;
    }

    const hasMinPricing = !!data.siteMinimumPricingSummary;
    const assetHead = ['Asset Name', 'kWp', 'Hybrid', 'Hub', 'Portal', 'Control', 'Report'];
    if (hasMinPricing) assetHead.push('Pricing');
    assetHead.push(`${cur}/kWp`, `${cur}/Year`);

    const assetBody = data.assetBreakdown.map(a => {
      const row: string[] = [
        a.assetName,
        a.pvCapacityKWp.toFixed(1),
        a.isHybrid ? 'Y' : '-',
        a.hubActive ? 'Y' : '-',
        a.portalActive ? 'Y' : '-',
        a.controlActive ? 'Y' : '-',
        a.reportingActive ? 'Y' : '-',
      ];
      if (hasMinPricing) row.push(a.usesMinimum ? 'Min' : 'kWp');
      row.push(a.pricePerKWp.toFixed(2), fmt(a.pricePerYear, cur));
      return row;
    });

    const colCount = assetHead.length;
    // Subtotal row
    const subtotalRow: any[] = [{ content: 'Subtotal (Annual):', colSpan: colCount - 1, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(data.assetBreakdownTotal, cur), styles: { fontStyle: 'bold', halign: 'right' } }];
    assetBody.push(subtotalRow as any);

    // Minimum contract adjustment
    if (data.minimumContractAdjustment > 0 && data.minimumAnnualValue) {
      assetBody.push([{ content: 'Minimum Contract Adjustment (Annual):', colSpan: colCount - 1, styles: { halign: 'right' } }, { content: fmt(data.minimumAnnualValue - data.assetBreakdownTotal, cur), styles: { halign: 'right' } }] as any);
      assetBody.push([{ content: 'Total with Minimum (Annual):', colSpan: colCount - 1, styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmt(data.minimumAnnualValue, cur), styles: { fontStyle: 'bold', halign: 'right' } }] as any);
    }

    const rightAlignCols: Record<number, any> = {};
    for (let i = 1; i < colCount; i++) rightAlignCols[i] = { halign: i >= colCount - 2 ? 'right' : 'center' };
    rightAlignCols[0] = { cellWidth: 'auto' };

    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      head: [assetHead],
      body: assetBody,
      styles: { fontSize: 6, cellPadding: 1 },
      headStyles: { fillColor: [244, 244, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: rightAlignCols,
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === SPS DISCOUNT BREAKDOWN ===
  if (data.spsDiscountBreakdown) {
    const sps = data.spsDiscountBreakdown;
    y = addSectionTitle(doc, 'SPS Monitoring Discount Breakdown', y);
    const spsRows = [
      ['Pre-Discount Monitoring Fee', fmt(sps.preDiscountMonitoringFee, cur)],
      [`Volume Discount (${sps.volumeDiscountPercent}%)`, `-${fmt(sps.volumeDiscountAmount, cur)}`],
      ['After Volume Discount', fmt(sps.afterVolumeDiscount, cur)],
      [`Upfront Discount (${sps.upfrontDiscountPercent}%)`, `-${fmt(sps.upfrontDiscountAmount, cur)}`],
      ['After Upfront Discount', fmt(sps.afterUpfrontDiscount, cur)],
      [`Commitment Discount (${sps.commitmentDiscountPercent}%)`, `-${fmt(sps.commitmentDiscountAmount, cur)}`],
      ['Final Monitoring Fee', fmt(sps.finalMonitoringFee, cur)],
    ];
    if (sps.minimumApplied) {
      spsRows.push(['Minimum Quarterly Value', fmt(sps.minimumQuarterlyValue, cur)]);
    }
    autoTable(doc, {
      startY: y, margin: { left: MARGIN, right: MARGIN },
      body: spsRows,
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 1: { halign: 'right' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // === CALCULATION BREAKDOWN ===
  y = addSectionTitle(doc, 'Calculation Breakdown', y);
  const breakdownLines: [string, string][] = [];
  const cb = data.calculationBreakdown;

  if (data.siteMinimumPricingSummary) {
    breakdownLines.push([`Sites on Normal Pricing (${data.siteMinimumPricingSummary.sitesOnNormal} sites)`, fmt(data.siteMinimumPricingSummary.normalPricingTotal, cur)]);
    breakdownLines.push([`+ Sites on Minimum Pricing (${data.siteMinimumPricingSummary.sitesOnMinimum} sites)`, fmt(data.siteMinimumPricingSummary.minimumPricingTotal, cur)]);
    breakdownLines.push(['= Asset/Module Subtotal (annual)', fmt(data.assetBreakdownTotal, cur)]);
    breakdownLines.push(['  × Billing Period', fmt(cb.assetBreakdownPeriod, cur)]);
  } else if (data.elumInternalBreakdown) {
    breakdownLines.push([`Elum Internal Graduated Tiers (${data.elumInternalBreakdown.totalMW.toFixed(2)} MW)`, fmt(data.elumInternalBreakdown.totalCost, cur)]);
  } else if (data.elumJubailiBreakdown) {
    breakdownLines.push([`Elum Jubaili Per-Site (${data.elumJubailiBreakdown.siteCount} sites)`, fmt(data.elumJubailiBreakdown.totalCost, cur)]);
  } else if (data.elumEpmBreakdown) {
    breakdownLines.push([`Elum ePM Small Sites (${data.elumEpmBreakdown.smallSitesCount} sites)`, fmt(data.elumEpmBreakdown.smallSitesTotal, cur)]);
    breakdownLines.push([`+ Elum ePM Large Sites (${data.elumEpmBreakdown.largeSitesCount} sites)`, fmt(data.elumEpmBreakdown.largeSitesTotal, cur)]);
  } else if (data.perSiteBreakdown) {
    if (data.perSiteBreakdown.onboardingCost > 0) breakdownLines.push([`Onboarding Fees (${data.perSiteBreakdown.sitesOnboarded} sites)`, fmt(data.perSiteBreakdown.onboardingCost, cur)]);
    if (data.perSiteBreakdown.annualSubscriptionCost > 0) breakdownLines.push([`+ Annual Subscriptions (${data.perSiteBreakdown.sitesRenewed} sites)`, fmt(data.perSiteBreakdown.annualSubscriptionCost, cur)]);
  } else if (cb.assetBreakdownPeriod > 0) {
    breakdownLines.push(['Asset Breakdown (period)', fmt(cb.assetBreakdownPeriod, cur)]);
  }

  if (cb.minimumCharges > 0) breakdownLines.push(['+ Minimum Charges', fmt(cb.minimumCharges, cur)]);
  if (cb.minimumContractAdjustment > 0) breakdownLines.push(['+ Min. Contract Adjustment', fmt(cb.minimumContractAdjustment, cur)]);
  if (cb.baseMonthlyPrice > 0) breakdownLines.push(['+ Base Monthly Price', fmt(cb.baseMonthlyPrice, cur)]);
  if (cb.retainerCost > 0) breakdownLines.push(['+ Retainer Hours', fmt(cb.retainerCost, cur)]);
  if (cb.discountedAssetsTotal > 0) breakdownLines.push(['+ Discounted Assets', fmt(cb.discountedAssetsTotal, cur)]);
  if (cb.addonsTotal > 0) breakdownLines.push(['+ Addons Total', fmt(cb.addonsTotal, cur)]);
  if (cb.fixedPackageCost > 0) breakdownLines.push(['+ Fixed Package Fee', fmt(cb.fixedPackageCost, cur)]);
  breakdownLines.push(['= Support Document Total', fmt(data.calculatedTotal, cur)]);

  autoTable(doc, {
    startY: y, margin: { left: MARGIN, right: MARGIN },
    body: breakdownLines.map(([label, val]) => {
      const isTotalLine = label.startsWith('=');
      return [
        { content: label, styles: isTotalLine ? { fontStyle: 'bold' as const } : {} },
        { content: val, styles: { halign: 'right' as const, ...(isTotalLine ? { fontStyle: 'bold' as const } : {}) } },
      ];
    }),
    styles: { fontSize: 7, cellPadding: 1.5 },
    theme: 'plain',
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Validation
  y = ensureSpace(doc, 10, y);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Invoice Total: ${fmt(data.invoiceTotal, cur)}`, MARGIN, y);
  y += 4;
  if (data.totalsMatch) {
    doc.setTextColor(22, 163, 74);
    doc.text('✓ Totals Match', MARGIN, y);
  } else {
    doc.setTextColor(220, 38, 38);
    doc.text(`⚠ Totals Mismatch — Difference: ${fmt(Math.abs(data.calculatedTotal - data.invoiceTotal), cur)}`, MARGIN, y);
  }
  doc.setTextColor(0, 0, 0);

  const pdfBase64 = doc.output('datauristring').split(',')[1];
  return pdfBase64;
}

/**
 * Render and directly download a support document PDF
 */
export function downloadSupportDocumentPdfDirect(data: SupportDocumentData, filename: string): void {
  renderSupportDocumentToPdf(data).then(base64 => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * Batch render multiple support documents to PDFs
 */
export async function renderMultipleSupportDocumentsToPdf(
  documents: Array<{ contractName?: string; data: SupportDocumentData }>
): Promise<Array<{ contractName?: string; pdfBase64: string }>> {
  const results: Array<{ contractName?: string; pdfBase64: string }> = [];

  for (const doc of documents) {
    try {
      const pdfBase64 = await renderSupportDocumentToPdf(doc.data);
      results.push({ contractName: doc.contractName, pdfBase64 });
    } catch (error) {
      console.error('Error generating PDF for', doc.contractName, error);
    }
  }

  return results;
}
