import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfUrl, contractId, isAmendment = false, amendmentId } = await req.json();
    
    if (!pdfUrl) {
      throw new Error("PDF URL is required");
    }

    console.log("Processing OCR for PDF:", pdfUrl);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch original contract data if processing an amendment
    let originalContractData = null;
    if (isAmendment && contractId) {
      const { data: originalContract } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .single();
      
      originalContractData = originalContract;
    }

    // Download PDF from storage
    const pdfPath = pdfUrl.split('/').slice(-2).join('/'); // Extract bucket path
    const { data: pdfData, error: downloadError } = await supabase
      .storage
      .from('contract-pdfs')
      .download(pdfPath);

    if (downloadError) {
      console.error("Error downloading PDF:", downloadError);
      throw new Error(`Failed to download PDF: ${downloadError.message}`);
    }

    // Convert PDF to base64
    const arrayBuffer = await pdfData.arrayBuffer();
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    console.log("PDF downloaded, size:", arrayBuffer.byteLength, "bytes");

    // Enhanced system prompt based on whether it's an amendment or original contract
    const systemPrompt = isAmendment 
      ? `You are a contract amendment data extraction specialist. Compare the amendment with the original contract and extract changes.

ORIGINAL CONTRACT DATA:
- Company Name: ${originalContractData?.company_name || 'N/A'}
- Package: ${originalContractData?.package || 'N/A'}
- Initial MW: ${originalContractData?.initial_mw || 'N/A'}
- Currency: ${originalContractData?.currency || 'N/A'}
- Billing Frequency: ${originalContractData?.billing_frequency || 'N/A'}
- Signed Date: ${originalContractData?.signed_date || 'N/A'}
- Period Start: ${originalContractData?.period_start || 'N/A'}
- Period End: ${originalContractData?.period_end || 'N/A'}
- Minimum Charge: ${originalContractData?.minimum_charge || 'N/A'}
- Minimum Annual Value: ${originalContractData?.minimum_annual_value || 'N/A'}

Extract all contract fields from the amendment document. Additionally, provide a "changes_summary" field that concisely describes what has changed compared to the original contract values above (e.g., "Capacity increased from 5MW to 7MW, Extended contract end date to Dec 2025, Added Custom API module").

Return structured data with all fields, even if unchanged, plus the changes_summary.`
      : `You are a contract data extraction specialist. Extract key contract information from the provided contract PDF.

Extract the following fields:
- companyName: Company/Customer Name
- packageType: Contract Package Type (starter/pro/custom/hybrid_tiered)
- initialMW: Initial MW capacity (numeric)
- currency: Currency (USD or EUR)
- billingFrequency: Billing Frequency (monthly/quarterly/biannual/annual)
- signedDate: Signed Date (YYYY-MM-DD format)
- periodStart: Contract Period Start Date (YYYY-MM-DD format)
- periodEnd: Contract Period End Date (YYYY-MM-DD format)
- nextInvoiceDate: Next Invoice Date (YYYY-MM-DD format)
- modules: Array of modules included
- addons: Array of add-ons
- customPricing: Object with custom pricing details
- volumeDiscounts: Object with volume discount details
- minimumCharge: Minimum charge amount
- minimumAnnualValue: Minimum annual value
- notes: Notes and special terms

Return ONLY valid JSON. For dates, use ISO 8601 format (YYYY-MM-DD). If a field is not found, omit it or return null.`;

    // Call Lovable AI with vision to extract contract data
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please extract all contract information from this PDF document."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_contract_data",
              description: "Extract structured contract data from the PDF",
              parameters: {
                type: "object",
                properties: {
                  companyName: { type: "string" },
                  packageType: { 
                    type: "string",
                    enum: ["starter", "pro", "custom", "hybrid_tiered"]
                  },
                  initialMW: { type: "number" },
                  currency: { 
                    type: "string",
                    enum: ["USD", "EUR"]
                  },
                  billingFrequency: { 
                    type: "string",
                    enum: ["monthly", "quarterly", "biannual", "annual"]
                  },
                  signedDate: { type: "string" },
                  periodStart: { type: "string" },
                  periodEnd: { type: "string" },
                  nextInvoiceDate: { type: "string" },
                  modules: {
                    type: "array",
                    items: { type: "string" }
                  },
                  addons: {
                    type: "array",
                    items: { type: "string" }
                  },
                  customPricing: { type: "object" },
                  volumeDiscounts: { type: "object" },
                  minimumCharge: { type: "number" },
                  minimumAnnualValue: { type: "number" },
                  notes: { type: "string" },
                  changes_summary: { type: "string" }
                },
                required: isAmendment ? ["changes_summary"] : ["companyName"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_contract_data" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    // Extract the structured data from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let extractedData = {};
    
    if (toolCall?.function?.arguments) {
      try {
        extractedData = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Error parsing tool call arguments:", e);
        // Fallback: try to extract from message content
        const content = aiData.choices?.[0]?.message?.content;
        if (content) {
          try {
            extractedData = JSON.parse(content);
          } catch (e2) {
            console.error("Error parsing message content:", e2);
          }
        }
      }
    }

    console.log("Extracted contract data:", extractedData);

    // Update contract or amendment with OCR data
    if (isAmendment && amendmentId) {
      // Update amendment record
      const { error: updateError } = await supabase
        .from('contract_amendments')
        .update({
          ocr_data: extractedData,
          ocr_status: 'completed',
          ocr_processed_at: new Date().toISOString(),
          changes_summary: (extractedData as any).changes_summary || null,
        })
        .eq('id', amendmentId);

      if (updateError) {
        console.error('Error updating amendment:', updateError);
        throw updateError;
      }
    } else if (contractId) {
      // Update contract record
      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          ocr_data: extractedData,
          ocr_status: 'completed',
          ocr_processed_at: new Date().toISOString(),
        })
        .eq('id', contractId);

      if (updateError) {
        console.error('Error updating contract:', updateError);
        throw updateError;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        extractedData 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in process-contract-ocr:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});