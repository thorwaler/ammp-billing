import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Account code to revenue type mapping
const ACCOUNT_MAPPINGS: Record<string, 'recurring' | 'non_recurring'> = {
  '1001': 'recurring',    // Revenue - Capacity-based Fees (ARR)
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

async function getValidAccessToken(supabase: any) {
  // Fetch ANY existing Xero connection (shared across team)
  const { data: connection, error } = await supabase
    .from('xero_connections')
    .select('*')
    .limit(1)
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

    // Update connection with new tokens using connection ID (shared connection)
    await supabase
      .from('xero_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

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

    const token = authHeader.replace('Bearer ', '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Check if this is an internal service call (from xero-scheduled-sync)
    const isServiceCall = token === serviceKey;
    let userId: string | null = null;

    if (!isServiceCall) {
      // Only verify user for external (browser) calls
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        throw new Error('Not authenticated');
      }
      userId = user.id;
    }

    console.log('Syncing Xero invoices. Service call:', isServiceCall, 'fromDate:', fromDate);

    // Get valid access token (from shared connection)
    const { accessToken, tenantId } = await getValidAccessToken(supabase);

    // Fetch custom account mappings (any user's, shared team settings)
    const { data: customMappings } = await supabase
      .from('revenue_account_mappings')
      .select('account_code, revenue_type')
      .limit(100);

    // Merge default mappings with custom mappings
    const accountMappings = { ...ACCOUNT_MAPPINGS };
    customMappings?.forEach((mapping: any) => {
      accountMappings[mapping.account_code] = mapping.revenue_type;
    });

    // Get existing invoices with xero_invoice_id to check for duplicates and updates
    // For service calls, get all invoices; for user calls, filter by user
    let existingInvoicesQuery = supabase
      .from('invoices')
      .select('id, xero_invoice_id, source, user_id')
      .not('xero_invoice_id', 'is', null);
    
    if (!isServiceCall && userId) {
      existingInvoicesQuery = existingInvoicesQuery.eq('user_id', userId);
    }
    
    const { data: existingInvoices } = await existingInvoicesQuery;

    // Build maps for existing invoices
    // Xero-only invoices (source='xero') - skip entirely
    // Internal invoices with xero_invoice_id (source='internal') - update with latest Xero data
    const xeroOnlyIds = new Set<string>();
    const internalInvoiceMap = new Map<string, string>(); // xero_invoice_id -> local invoice id

    existingInvoices?.forEach(inv => {
      if (inv.source === 'xero') {
        xeroOnlyIds.add(inv.xero_invoice_id);
      } else if (inv.source === 'internal' && inv.xero_invoice_id) {
        internalInvoiceMap.set(inv.xero_invoice_id, inv.id);
      }
    });

    // Build Xero API where clause with optional date filter
    let whereClause = 'Type=="ACCREC"';
    if (fromDate) {
      // Parse the date - handle ISO strings like "2025-11-16T10:55:59.916Z"
      // Extract only the date portion before 'T'
      let dateOnly = fromDate;
      if (fromDate.includes('T')) {
        dateOnly = fromDate.split('T')[0];  // "2025-11-16"
      }
      const dateParts = dateOnly.split('-');
      const year = dateParts[0];
      const month = dateParts[1];
      const day = dateParts[2];
      console.log(`Date filter: fromDate=${fromDate}, parsed as year=${year}, month=${month}, day=${day}`);
      whereClause += ` AND Date >= DateTime(${year}, ${month}, ${day})`;
    }
    
    // Fetch ALL invoices from Xero with pagination (100 per page limit)
    let allXeroInvoices: any[] = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?Statuses=AUTHORISED,PAID&page=${page}&where=${encodeURIComponent(whereClause)}`;
      console.log(`Fetching Xero invoices page ${page}...`);

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
      const pageInvoices = xeroData.Invoices || [];
      
      console.log(`Page ${page}: fetched ${pageInvoices.length} invoices`);
      
      allXeroInvoices = [...allXeroInvoices, ...pageInvoices];
      
      // Xero returns max 100 invoices per page - if we get less, we've reached the end
      if (pageInvoices.length < 100) {
        hasMorePages = false;
      } else {
        page++;
      }
    }
    
    const xeroInvoices = allXeroInvoices;
    console.log(`Found ${xeroInvoices.length} total invoices across ${page} page(s) (filtered by date: ${fromDate || 'all time'})`);

    // Get all customers to match by name (shared across team)
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, user_id');

    const customerNameMap = new Map(customers?.map(c => [c.name.toLowerCase(), { id: c.id, userId: c.user_id }]) || []);

    // Process invoices
    let syncedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const xeroInv of xeroInvoices) {
      const xeroInvoiceId = xeroInv.InvoiceID;
      
      // Get currency info for EUR conversion
      const currencyCode = xeroInv.CurrencyCode || 'EUR';
      const currencyRate = xeroInv.CurrencyRate || null;
      const invoiceTotal = xeroInv.Total || 0;
      const lineItems = xeroInv.LineItems || [];
      
      // Calculate ARR/NRR from line items
      const { arrAmount, nrrAmount } = calculateARRNRR(lineItems, accountMappings);
      
      // Get credit note amount (if any)
      const amountCredited = xeroInv.AmountCredited || 0;
      const amountCreditedEur = convertToEUR(amountCredited, currencyCode, currencyRate);
      
      // Convert all amounts to EUR
      const invoiceAmountEur = convertToEUR(invoiceTotal, currencyCode, currencyRate);
      const arrAmountEur = convertToEUR(arrAmount, currencyCode, currencyRate);
      const nrrAmountEur = convertToEUR(nrrAmount, currencyCode, currencyRate);
      
      // Check if this is an internal invoice that needs updating
      if (internalInvoiceMap.has(xeroInvoiceId)) {
        const localInvoiceId = internalInvoiceMap.get(xeroInvoiceId)!;
        
        console.log(`Updating internal invoice ${localInvoiceId} from Xero (${xeroInv.InvoiceNumber})`);
        
        // Update internal invoice with latest Xero data
        const { error: updateError } = await supabase
          .from('invoices')
          .update({
            invoice_amount: invoiceTotal,
            invoice_amount_eur: invoiceAmountEur,
            xero_status: xeroInv.Status,
            xero_line_items: lineItems,
            xero_synced_at: new Date().toISOString(),
            arr_amount: arrAmount,
            arr_amount_eur: arrAmountEur,
            nrr_amount: nrrAmount,
            nrr_amount_eur: nrrAmountEur,
            xero_amount_credited: amountCredited,
            xero_amount_credited_eur: amountCreditedEur,
            updated_at: new Date().toISOString(),
          })
          .eq('id', localInvoiceId);

        if (updateError) {
          console.error('Error updating internal invoice:', localInvoiceId, updateError);
        } else {
          updatedCount++;
        }
        continue;
      }

      // Check if this is an existing Xero-only invoice that needs status update
      if (xeroOnlyIds.has(xeroInvoiceId)) {
        // Find the local invoice to update its status
        const existingInvoice = existingInvoices?.find(i => i.xero_invoice_id === xeroInvoiceId);
        
        if (existingInvoice) {
          // Update Xero-only invoice with latest status from Xero
          const { error: updateError } = await supabase
            .from('invoices')
            .update({
              xero_status: xeroInv.Status,
              xero_synced_at: new Date().toISOString(),
              xero_amount_credited: amountCredited,
              xero_amount_credited_eur: amountCreditedEur,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingInvoice.id);

          if (updateError) {
            console.error('Error updating Xero-only invoice status:', existingInvoice.id, updateError);
            skippedCount++;
          } else {
            updatedCount++;
          }
        } else {
          skippedCount++;
        }
        continue;
      }

      // Try to match customer by name
      const contactName = xeroInv.Contact?.Name || '';
      const customerMatch = customerNameMap.get(contactName.toLowerCase());
      
      console.log(`Inserting new invoice from Xero: ${xeroInv.InvoiceNumber} (Total=${invoiceTotal}, Credited=${amountCredited})`);

      // Determine user_id: use matched customer's user_id, or first existing invoice's user_id
      const invoiceUserId = customerMatch?.userId || existingInvoices?.[0]?.user_id || null;
      
      if (!invoiceUserId) {
        console.warn(`Skipping invoice ${xeroInv.InvoiceNumber}: no user_id could be determined`);
        skippedCount++;
        continue;
      }

      // Insert new invoice from Xero
      const { error: insertError } = await supabase
        .from('invoices')
        .insert({
          user_id: invoiceUserId,
          customer_id: customerMatch?.id || null,
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
          xero_amount_credited: amountCredited,
          xero_amount_credited_eur: amountCreditedEur,
        });

      if (insertError) {
        console.error('Error inserting invoice:', xeroInvoiceId, insertError);
      } else {
        syncedCount++;
      }
    }

    console.log(`Synced ${syncedCount} new, updated ${updatedCount} internal, skipped ${skippedCount} existing`);

    return new Response(
      JSON.stringify({
        success: true,
        syncedCount,
        updatedCount,
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