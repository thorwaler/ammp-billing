import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import jsPDF from 'https://esm.sh/jspdf@2.5.2?bundle-deps';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SupportDocumentData {
  customerName: string;
  contractName?: string;
  invoicePeriod: string;
  invoiceDate: string;
  currency: string;
  discountPercent?: number;
  yearInvoices: Array<{
    period: string;
    monitoringFee: number;
    solcastFee: number;
    additionalWork: number;
    total: number;
  }>;
  yearTotal: number;
  assetBreakdown?: any[];
  elumEpmBreakdown?: any;
  elumJubailiBreakdown?: any;
  elumInternalBreakdown?: any;
  solcastBreakdown?: any[];
  solcastTotal?: number;
  addonsBreakdown?: any[];
  addonsTotal?: number;
  discountedAssetsBreakdown?: any[];
  discountedAssetsTotal?: number;
  retainerBreakdown?: any;
  grandTotal: number;
}

async function getValidAccessToken(supabase: any) {
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('*')
    .limit(1)
    .single();

  if (!connection) {
    throw new Error('No Xero connection found');
  }

  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  
  if (expiresAt <= now) {
    const clientId = Deno.env.get('XERO_CLIENT_ID');
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET');

    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to refresh Xero token: ${errorText}`);
    }

    const tokens = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('xero_connections').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: newExpiresAt,
    }).eq('id', connection.id);

    return { accessToken: tokens.access_token, tenantId: connection.tenant_id };
  }

  return { accessToken: connection.access_token, tenantId: connection.tenant_id };
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === 'EUR' ? '€' : '$';
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generatePdfFromData(data: SupportDocumentData): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  let yPos = 20;
  const leftMargin = 15;
  const pageWidth = 210;
  const contentWidth = pageWidth - 30;
  
  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Support Document', leftMargin, yPos);
  yPos += 10;
  
  // Header info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Customer: ${data.customerName}`, leftMargin, yPos);
  yPos += 5;
  if (data.contractName) {
    doc.text(`Contract: ${data.contractName}`, leftMargin, yPos);
    yPos += 5;
  }
  doc.text(`Invoice Period: ${data.invoicePeriod}`, leftMargin, yPos);
  yPos += 5;
  doc.text(`Date: ${data.invoiceDate}`, leftMargin, yPos);
  yPos += 5;
  doc.text(`Currency: ${data.currency}`, leftMargin, yPos);
  yPos += 10;
  
  // Year-to-Date Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Year-to-Date Invoice Summary', leftMargin, yPos);
  yPos += 7;
  
  // Table header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const colWidths = [35, 35, 30, 35, 30];
  const headers = ['Period', 'Monitoring', 'Solcast', 'Add. Work', 'Total'];
  
  doc.setFillColor(244, 244, 245);
  doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F');
  
  let xPos = leftMargin;
  headers.forEach((header, i) => {
    doc.text(header, xPos + 2, yPos);
    xPos += colWidths[i];
  });
  yPos += 6;
  
  // Table rows
  doc.setFont('helvetica', 'normal');
  data.yearInvoices.forEach((inv) => {
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
    
    xPos = leftMargin;
    doc.text(inv.period, xPos + 2, yPos);
    xPos += colWidths[0];
    doc.text(formatCurrency(inv.monitoringFee, data.currency), xPos + 2, yPos);
    xPos += colWidths[1];
    doc.text(formatCurrency(inv.solcastFee, data.currency), xPos + 2, yPos);
    xPos += colWidths[2];
    doc.text(formatCurrency(inv.additionalWork, data.currency), xPos + 2, yPos);
    xPos += colWidths[3];
    doc.text(formatCurrency(inv.total, data.currency), xPos + 2, yPos);
    yPos += 5;
  });
  
  // Total row
  doc.setFillColor(244, 244, 245);
  doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Year Total:', leftMargin + 2, yPos);
  doc.text(formatCurrency(data.yearTotal, data.currency), leftMargin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, yPos);
  yPos += 12;
  
  // Elum ePM Breakdown
  if (data.elumEpmBreakdown) {
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Elum ePM Pricing Breakdown', leftMargin, yPos);
    yPos += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Site Size Threshold: ${data.elumEpmBreakdown.threshold} kWp`, leftMargin, yPos);
    yPos += 5;
    doc.text(`Small Sites (≤ threshold): ${data.elumEpmBreakdown.smallSitesCount} sites @ ${formatCurrency(data.elumEpmBreakdown.belowThresholdRate, data.currency)}/MWp`, leftMargin, yPos);
    yPos += 5;
    doc.text(`Large Sites (> threshold): ${data.elumEpmBreakdown.largeSitesCount} sites @ ${formatCurrency(data.elumEpmBreakdown.aboveThresholdRate, data.currency)}/MWp`, leftMargin, yPos);
    yPos += 5;
    doc.text(`Small Sites Total: ${formatCurrency(data.elumEpmBreakdown.smallSitesTotal, data.currency)}`, leftMargin, yPos);
    yPos += 5;
    doc.text(`Large Sites Total: ${formatCurrency(data.elumEpmBreakdown.largeSitesTotal, data.currency)}`, leftMargin, yPos);
    yPos += 10;
  }
  
  // Elum Jubaili Breakdown
  if (data.elumJubailiBreakdown) {
    if (yPos > 250) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Elum Jubaili Pricing Breakdown', leftMargin, yPos);
    yPos += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Per-Site Annual Fee: ${formatCurrency(data.elumJubailiBreakdown.perSiteFee, data.currency)}`, leftMargin, yPos);
    yPos += 5;
    doc.text(`Site Count: ${data.elumJubailiBreakdown.siteCount}`, leftMargin, yPos);
    yPos += 5;
    doc.text(`Total Cost: ${formatCurrency(data.elumJubailiBreakdown.totalCost, data.currency)}`, leftMargin, yPos);
    yPos += 10;
  }
  
  // Elum Internal Breakdown
  if (data.elumInternalBreakdown?.tiers?.length > 0) {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Elum Internal - Graduated Tier Pricing', leftMargin, yPos);
    yPos += 7;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const tierColWidths = [50, 30, 40, 40];
    const tierHeaders = ['Tier', 'MW in Tier', 'Price/MW', 'Cost'];
    
    doc.setFillColor(244, 244, 245);
    doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F');
    
    xPos = leftMargin;
    tierHeaders.forEach((h, i) => {
      doc.text(h, xPos + 2, yPos);
      xPos += tierColWidths[i];
    });
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    data.elumInternalBreakdown.tiers.forEach((tier: any) => {
      if (yPos > 270) { doc.addPage(); yPos = 20; }
      xPos = leftMargin;
      doc.text(tier.label || '', xPos + 2, yPos);
      xPos += tierColWidths[0];
      doc.text(tier.mwInTier?.toFixed(2) || '0', xPos + 2, yPos);
      xPos += tierColWidths[1];
      doc.text(formatCurrency(tier.pricePerMW || 0, data.currency), xPos + 2, yPos);
      xPos += tierColWidths[2];
      doc.text(formatCurrency(tier.cost || 0, data.currency), xPos + 2, yPos);
      yPos += 5;
    });
    
    doc.setFillColor(244, 244, 245);
    doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', leftMargin + 2, yPos);
    doc.text(formatCurrency(data.elumInternalBreakdown.totalCost || 0, data.currency), leftMargin + tierColWidths[0] + tierColWidths[1] + tierColWidths[2] + 2, yPos);
    yPos += 12;
  }
  
  // Solcast Breakdown
  if (data.solcastBreakdown && data.solcastBreakdown.length > 0) {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Solcast Fee Breakdown', leftMargin, yPos);
    yPos += 7;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const solColWidths = [50, 35, 40, 40];
    const solHeaders = ['Month', 'Sites', 'Price/Site', 'Total'];
    
    doc.setFillColor(244, 244, 245);
    doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F');
    
    xPos = leftMargin;
    solHeaders.forEach((h, i) => {
      doc.text(h, xPos + 2, yPos);
      xPos += solColWidths[i];
    });
    yPos += 6;
    
    doc.setFont('helvetica', 'normal');
    data.solcastBreakdown.forEach((item: any) => {
      if (yPos > 270) { doc.addPage(); yPos = 20; }
      xPos = leftMargin;
      doc.text(item.month || '', xPos + 2, yPos);
      xPos += solColWidths[0];
      doc.text(String(item.siteCount || 0), xPos + 2, yPos);
      xPos += solColWidths[1];
      doc.text(formatCurrency(item.pricePerSite || 0, data.currency), xPos + 2, yPos);
      xPos += solColWidths[2];
      doc.text(formatCurrency(item.totalPerMonth || 0, data.currency), xPos + 2, yPos);
      yPos += 5;
    });
    
    doc.setFillColor(244, 244, 245);
    doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', leftMargin + 2, yPos);
    doc.text(formatCurrency(data.solcastTotal || 0, data.currency), leftMargin + solColWidths[0] + solColWidths[1] + solColWidths[2] + 2, yPos);
    yPos += 12;
  }
  
  // Grand Total
  if (yPos > 260) { doc.addPage(); yPos = 20; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(230, 230, 235);
  doc.rect(leftMargin, yPos - 5, contentWidth, 10, 'F');
  doc.text(`Grand Total: ${formatCurrency(data.grandTotal, data.currency)}`, leftMargin + 2, yPos + 2);
  
  // Get PDF as array buffer and convert to standard ArrayBuffer
  const pdfOutput = doc.output('arraybuffer') as ArrayBuffer;
  return pdfOutput;
}

async function attachPdfToXeroInvoice(
  accessToken: string,
  tenantId: string,
  xeroInvoiceId: string,
  pdfBytes: ArrayBuffer,
  filename: string
): Promise<void> {
  console.log(`Attaching PDF "${filename}" to Xero invoice ${xeroInvoiceId}`);
  
  const attachmentUrl = `https://api.xero.com/api.xro/2.0/Invoices/${xeroInvoiceId}/Attachments/${encodeURIComponent(filename)}`;
  
  const response = await fetch(attachmentUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/pdf',
    },
    body: pdfBytes,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Xero attachment error:', errorText);
    throw new Error(`Failed to attach PDF to Xero invoice: ${response.status} ${errorText.substring(0, 200)}`);
  }
  
  console.log('PDF attachment uploaded successfully');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { xeroInvoiceId, supportDocumentData, supportDocumentDataArray } = await req.json();

    if (!xeroInvoiceId) {
      throw new Error('Missing xeroInvoiceId');
    }

    console.log(`Processing attachment for Xero invoice: ${xeroInvoiceId}`);

    const { accessToken, tenantId } = await getValidAccessToken(supabase);

    // Handle single document or array of documents
    const documents: Array<{ contractName?: string; data: SupportDocumentData }> = [];
    
    if (supportDocumentDataArray && Array.isArray(supportDocumentDataArray)) {
      documents.push(...supportDocumentDataArray.filter((d: any) => d.data));
    } else if (supportDocumentData) {
      documents.push({ data: supportDocumentData });
    }

    if (documents.length === 0) {
      console.log('No support documents to attach');
      return new Response(
        JSON.stringify({ success: true, message: 'No documents to attach' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating and attaching ${documents.length} support document(s)`);

    for (const doc of documents) {
      try {
        const pdfBytes = generatePdfFromData(doc.data);
        
        // Create filename based on document data
        const customerName = doc.data.customerName?.replace(/[^a-zA-Z0-9]/g, '_') || 'Customer';
        const contractLabel = doc.contractName?.replace(/[^a-zA-Z0-9]/g, '_') || '';
        const period = doc.data.invoicePeriod?.replace(/[^a-zA-Z0-9]/g, '_') || 'Invoice';
        
        const filename = contractLabel 
          ? `Support_Document_${customerName}_${contractLabel}_${period}.pdf`
          : `Support_Document_${customerName}_${period}.pdf`;
        
        await attachPdfToXeroInvoice(accessToken, tenantId, xeroInvoiceId, pdfBytes, filename);
        
        console.log(`Successfully attached: ${filename}`);
      } catch (docError) {
        console.error(`Error processing document:`, docError);
        // Continue with other documents even if one fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, attachedCount: documents.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in xero-attach-support-document:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
