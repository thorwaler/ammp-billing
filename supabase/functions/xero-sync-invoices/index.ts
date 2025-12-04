import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Account code to revenue type mapping
const ACCOUNT_MAPPINGS: Record<string, 'recurring' | 'non_recurring'> = {
  '1002': 'recurring',    // Platform Fees (ARR)
  '1000': 'non_recurring', // Implementation Fees (NRR)
};

// Parse Xero's Microsoft JSON date format: /Date(milliseconds+offset)/
function parseXeroDate(xeroDate: string): string | null {
  if (!xeroDate) return null;
  
  // Match pattern: /Date(1759881600000+0000)/ or /Date(1759881600000)/
  const match = xeroDate.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
  if (!match) {
    // If it's already a valid ISO date, return it
    if (xeroDate.includes('-') || xeroDate.includes('T')) {
      return xeroDate;
    }
    console.error('Could not parse Xero date:', xeroDate);
    return null;
  }
  
  const milliseconds = parseInt(match[1], 10);
  return new Date(milliseconds).toISOString().split('T')[0]; // Return YYYY-MM-DD
}

async function getValidAccessToken(supabase: any, userId: string) {
  // Fetch the current Xero connection
  const { data: connection, error } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !connection) {
    throw new Error('No Xero connection found');
  }

  // Check if token is expired
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();

  if (now >= expiresAt) {
    // Refresh the token
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
      console.error('Token refresh failed:', errorText);
      throw new Error('Failed to refresh Xero token');
    }

    const tokens = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Update connection with new tokens
    await supabase
      .from('xero_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return { accessToken: tokens.access_token, tenantId: connection.tenant_id };
  }

  return { accessToken: connection.access_token, tenantId: connection.tenant_id };
}

function calculateARRNRR(lineItems: any[], accountMappings: Record<string, 'recurring' | 'non_recurring'>) {
  let arrAmount = 0;
  let nrrAmount = 0;

  for (const item of lineItems || []) {
    const accountCode = item.AccountCode || '';
    const amount = item.LineAmount || 0;
    const mapping = accountMappings[accountCode];

    if (mapping === 'recurring') {
      arrAmount += amount;
    } else {
      // Default unknown accounts to NRR
      nrrAmount += amount;
    }
  }

  return { arrAmount, nrrAmount };
}

// Convert amount to EUR using Xero's currency rate
function convertToEUR(amount: number, currencyCode: string, currencyRate: number | null): number {
  if (currencyCode === 'EUR') return amount;
  
  // If Xero provides a currency rate (to base currency), use it
  // Xero's CurrencyRate is the rate from invoice currency to org's base currency
  if (currencyRate && currencyRate > 0) {
    // If base currency is EUR, divide by rate
    // CurrencyRate in Xero is typically "invoice currency / base currency"
    return amount / currencyRate;
  }
  
  // Fallback rates if no rate provided
  const fallbackRates: Record<string, number> = {
    'USD': 1.09,  // 1 EUR = 1.09 USD
    'NGN': 1600,  // 1 EUR = 1600 NGN
    'GBP': 0.86,  // 1 EUR = 0.86 GBP
  };
  
  const rate = fallbackRates[currencyCode];
  if (rate) {
    return amount / rate;
  }
  
  // If unknown currency, return original amount with warning
  console.warn(`Unknown currency ${currencyCode}, no conversion applied`);
  return amount;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for fromDate parameter
    let fromDate: string | null = null;
    try {
      const body = await req.json();
      fromDate = body?.fromDate || null;
    } catch {
      // No body or invalid JSON, use default (no date filter)
    }

    // Get auth header from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    console.log('Syncing Xero invoices for user:', user.id, 'fromDate:', fromDate);

    // Get valid access token
    const { accessToken, tenantId } = await getValidAccessToken(supabase, user.id);

    // Fetch custom account mappings for user (if any)
    const { data: customMappings } = await supabase
      .from('revenue_account_mappings')
      .select('account_code, revenue_type')
      .eq('user_id', user.id);

    // Merge default mappings with user's custom mappings
    const accountMappings = { ...ACCOUNT_MAPPINGS };
    customMappings?.forEach((mapping: any) => {
      accountMappings[mapping.account_code] = mapping.revenue_type;
    });

    // Get existing Xero invoice IDs to avoid duplicates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('xero_invoice_id')
      .eq('user_id', user.id)
      .not('xero_invoice_id', 'is', null);

    const existingXeroIds = new Set(existingInvoices?.map(inv => inv.xero_invoice_id) || []);

    // Build Xero API URL with optional date filter
    let whereClause = 'Type=="ACCREC"';
    if (fromDate) {
      // Parse the date and format for Xero API
      const dateParts = fromDate.split('-');
      const year = dateParts[0];
      const month = dateParts[1];
      const day = dateParts[2];
      whereClause += ` AND Date >= DateTime(${year}, ${month}, ${day})`;
    }
    
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?Statuses=AUTHORISED,PAID&where=${encodeURIComponent(whereClause)}`;
    console.log('Xero API URL:', xeroUrl);

    // Fetch invoices from Xero (ACCREC = Accounts Receivable)
    const xeroResponse = await fetch(xeroUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    });

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error('Xero API error:', errorText);
      throw new Error(`Xero API error: ${xeroResponse.status}`);
    }

    const xeroData = await xeroResponse.json();
    const xeroInvoices = xeroData.Invoices || [];
    
    console.log(`Found ${xeroInvoices.length} invoices in Xero (filtered by date: ${fromDate || 'all time'})`);

    // Get all customers to match by name
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('user_id', user.id);

    const customerNameMap = new Map(customers?.map(c => [c.name.toLowerCase(), c.id]) || []);

    // Process new invoices
    let syncedCount = 0;
    let skippedCount = 0;

    for (const xeroInv of xeroInvoices) {
      const xeroInvoiceId = xeroInv.InvoiceID;

      // Skip if already exists
      if (existingXeroIds.has(xeroInvoiceId)) {
        skippedCount++;
        continue;
      }

      // Try to match customer by name
      const contactName = xeroInv.Contact?.Name || '';
      const customerId = customerNameMap.get(contactName.toLowerCase());

      // Calculate ARR/NRR from line items
      const lineItems = xeroInv.LineItems || [];
      const { arrAmount, nrrAmount } = calculateARRNRR(lineItems, accountMappings);
      
      // Get currency info for EUR conversion
      const currencyCode = xeroInv.CurrencyCode || 'EUR';
      const currencyRate = xeroInv.CurrencyRate || null;
      const invoiceTotal = xeroInv.Total || 0;
      
      // Convert all amounts to EUR
      const invoiceAmountEur = convertToEUR(invoiceTotal, currencyCode, currencyRate);
      const arrAmountEur = convertToEUR(arrAmount, currencyCode, currencyRate);
      const nrrAmountEur = convertToEUR(nrrAmount, currencyCode, currencyRate);

      // Insert invoice
      const { error: insertError } = await supabase
        .from('invoices')
        .insert({
          user_id: user.id,
          customer_id: customerId || null,
          invoice_date: parseXeroDate(xeroInv.Date) || new Date().toISOString().split('T')[0],
          invoice_amount: invoiceTotal,
          invoice_amount_eur: invoiceAmountEur,
          billing_frequency: 'unknown', // Can't determine from Xero
          mw_managed: 0,
          total_mw: 0,
          currency: currencyCode,
          source: 'xero',
          xero_invoice_id: xeroInvoiceId,
          xero_reference: xeroInv.InvoiceNumber,
          xero_status: xeroInv.Status,
          xero_contact_name: contactName,
          xero_line_items: lineItems,
          xero_synced_at: new Date().toISOString(),
          arr_amount: arrAmount,
          arr_amount_eur: arrAmountEur,
          nrr_amount: nrrAmount,
          nrr_amount_eur: nrrAmountEur,
        });

      if (insertError) {
        console.error('Error inserting invoice:', xeroInvoiceId, insertError);
      } else {
        syncedCount++;
      }
    }

    console.log(`Synced ${syncedCount} new invoices, skipped ${skippedCount} existing`);

    return new Response(
      JSON.stringify({
        success: true,
        syncedCount,
        skippedCount,
        totalInXero: xeroInvoices.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Error syncing Xero invoices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
