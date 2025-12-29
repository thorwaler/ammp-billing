import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Helper function to decode base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
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

    const { 
      xeroInvoiceId, 
      // New format: pre-generated PDFs as base64
      pdfBase64,
      pdfBase64Array,
      filename,
      // Legacy format for backward compatibility (not used anymore)
      supportDocumentData,
      supportDocumentDataArray,
      accessToken: passedAccessToken,
      tenantId: passedTenantId
    } = await req.json();

    if (!xeroInvoiceId) {
      throw new Error('Missing xeroInvoiceId');
    }

    console.log(`Processing attachment for Xero invoice: ${xeroInvoiceId}`);

    // Use passed tokens if available, otherwise fetch from database
    let accessToken = passedAccessToken;
    let tenantId = passedTenantId;
    
    if (!accessToken || !tenantId) {
      console.log('No tokens passed, fetching from database...');
      const tokenData = await getValidAccessToken(supabase);
      accessToken = tokenData.accessToken;
      tenantId = tokenData.tenantId;
    } else {
      console.log('Using passed access token and tenant ID');
    }

    // Collect all PDFs to attach
    const pdfsToAttach: Array<{ pdfBase64: string; filename: string }> = [];
    
    // Handle new format: pre-generated PDFs
    if (pdfBase64Array && Array.isArray(pdfBase64Array)) {
      for (const p of pdfBase64Array) {
        if (p.pdfBase64) {
          // Map contractName to filename with .pdf extension
          // Remove special characters that could cause issues in filenames
          const baseName = (p.filename || p.contractName || 'SupportDocument')
            .replace(/[^a-zA-Z0-9-_]/g, '_');
          const pdfFilename = `${baseName}_SupportDoc.pdf`;
          pdfsToAttach.push({ 
            pdfBase64: p.pdfBase64, 
            filename: pdfFilename 
          });
        }
      }
    } else if (pdfBase64 && filename) {
      pdfsToAttach.push({ pdfBase64, filename });
    }

    // If no new format PDFs, log and return success (we no longer generate PDFs server-side)
    if (pdfsToAttach.length === 0) {
      // Check if legacy format was passed - warn that it's no longer supported
      if (supportDocumentData || (supportDocumentDataArray && supportDocumentDataArray.length > 0)) {
        console.log('Legacy supportDocumentData format received - PDF generation now happens in browser');
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'PDF generation now happens in the browser. Please update your client code.',
            needsClientUpdate: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('No PDFs to attach');
      return new Response(
        JSON.stringify({ success: true, message: 'No PDFs to attach' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Attaching ${pdfsToAttach.length} pre-generated PDF(s)`);

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    for (const pdf of pdfsToAttach) {
      try {
        // Decode base64 to binary
        const pdfBytes = base64ToArrayBuffer(pdf.pdfBase64);
        
        await attachPdfToXeroInvoice(accessToken, tenantId, xeroInvoiceId, pdfBytes, pdf.filename);
        
        console.log(`Successfully attached: ${pdf.filename}`);
        successCount++;
      } catch (docError: any) {
        console.error(`Error attaching PDF ${pdf.filename}:`, docError);
        failureCount++;
        const errorMsg = docError?.message || String(docError);
        errors.push(errorMsg);
      }
    }

    const allFailed = successCount === 0 && failureCount > 0;
    const responseData = {
      success: !allFailed,
      attachedCount: successCount,
      failedCount: failureCount,
      errors: errors.length > 0 ? errors : undefined,
      needsReconnect: errors.some(e => e.includes('401') || e.includes('Unauthorized'))
    };
    
    console.log('Attachment result:', responseData);

    return new Response(
      JSON.stringify(responseData),
      { 
        status: allFailed ? 400 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('Error in xero-attach-support-document:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
