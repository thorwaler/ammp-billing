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

    // Convert PDF to base64 for AI processing
    const arrayBuffer = await pdfData.arrayBuffer();
    console.log("PDF downloaded, size:", arrayBuffer.byteLength, "bytes");

    let base64Pdf = "";
    try {
      const uint8Array = new Uint8Array(arrayBuffer);
      // Use chunks to avoid stack overflow on large files
      const chunkSize = 32768;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
        base64Pdf += btoa(String.fromCharCode(...chunk));
      }
      console.log("PDF converted to base64, length:", base64Pdf.length);
    } catch (conversionError) {
      console.error("Error converting PDF to base64:", conversionError);
      return new Response(
        JSON.stringify({ error: "Failed to process PDF file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enhanced system prompt based on whether it's an amendment or original contract
    const systemPrompt = isAmendment 
      ? `You are a contract amendment data extraction specialist. Compare the amendment with the original contract and extract changes.

⚠️ CRITICAL INSTRUCTIONS - ANTI-HALLUCINATION:
1. Only extract information that is EXPLICITLY STATED in the amendment document
2. Do NOT infer, guess, estimate, or make up any information
3. Do NOT use typical, standard, or template values for any field
4. If a field is not clearly present in the document, OMIT it entirely from your response
5. When in doubt, LEAVE IT OUT rather than guessing
6. Do NOT include fields like "implementation fees", "setup costs", or similar unless they are explicitly mentioned in the document

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

Extract ONLY the fields that are explicitly mentioned in the amendment document. Additionally, provide a "changes_summary" field that concisely describes what has changed compared to the original contract values above (e.g., "Capacity increased from 5MW to 7MW, Extended contract end date to Dec 2025, Added Custom API module").

Only include fields that are explicitly stated in the amendment. Do not fill in fields that are not mentioned.`
      : `You are a contract data extraction specialist. Extract key contract information from the provided contract PDF.

⚠️ CRITICAL INSTRUCTIONS - ANTI-HALLUCINATION:
1. Only extract information that is EXPLICITLY STATED in the contract document
2. Do NOT infer, guess, estimate, or make up any information
3. Do NOT use typical, standard, or template values for any field
4. If a field is not clearly present in the document, OMIT it entirely from your response
5. When in doubt, LEAVE IT OUT rather than guessing
6. Do NOT include fields like "implementation fees", "setup costs", "onboarding fees", or similar unless they are explicitly mentioned in the document
7. For pricing, ONLY extract values that are explicitly written in the contract

Extract ONLY the following fields if they are explicitly stated:
- companyName: Company/Customer Name (REQUIRED - must be in document)
- packageType: Contract Package Type (only if explicitly stated: starter/pro/custom/hybrid_tiered)
- initialMW: Initial MW capacity (only if explicitly stated as a number)
- currency: Currency (only if explicitly stated: USD or EUR)
- billingFrequency: Billing Frequency (only if explicitly stated: monthly/quarterly/biannual/annual)
- signedDate: Signed Date (only if explicitly stated, use YYYY-MM-DD format)
- periodStart: Contract Period Start Date (only if explicitly stated, use YYYY-MM-DD format)
- periodEnd: Contract Period End Date (only if explicitly stated, use YYYY-MM-DD format)
- nextInvoiceDate: Next Invoice Date (only if explicitly stated, use YYYY-MM-DD format)
- modules: Array of modules included (only if explicitly listed)
- addons: Array of add-ons (only if explicitly listed)
- customPricing: Object with custom pricing details (only if explicitly stated)
- volumeDiscounts: Object with volume discount details (only if explicitly stated)
- minimumCharge: Minimum charge amount (only if explicitly stated)
- minimumAnnualValue: Minimum annual value (only if explicitly stated)
- notes: Notes and special terms (only if explicitly stated)

Remember: It is better to omit a field than to guess or infer its value. Return ONLY valid JSON with fields that are explicitly present in the document.`;

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
                type: "inline_data",
                inline_data: {
                  mime_type: "application/pdf",
                  data: base64Pdf
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
              description: "Extract structured contract data from the PDF. ONLY include fields that are explicitly stated in the document. Do not infer or guess any values.",
              parameters: {
                type: "object",
                properties: {
                  companyName: { 
                    type: "string",
                    description: "Company/Customer name - only if explicitly stated in document"
                  },
                  packageType: { 
                    type: "string",
                    enum: ["starter", "pro", "custom", "hybrid_tiered"],
                    description: "Contract package type - only if explicitly stated in document"
                  },
                  initialMW: { 
                    type: "number",
                    description: "Initial MW capacity - only if explicitly stated as a number in document"
                  },
                  currency: { 
                    type: "string",
                    enum: ["USD", "EUR"],
                    description: "Currency - only if explicitly stated in document"
                  },
                  billingFrequency: { 
                    type: "string",
                    enum: ["monthly", "quarterly", "biannual", "annual"],
                    description: "Billing frequency - only if explicitly stated in document"
                  },
                  signedDate: { 
                    type: "string",
                    description: "Signed date in YYYY-MM-DD format - only if explicitly stated in document"
                  },
                  periodStart: { 
                    type: "string",
                    description: "Contract start date in YYYY-MM-DD format - only if explicitly stated in document"
                  },
                  periodEnd: { 
                    type: "string",
                    description: "Contract end date in YYYY-MM-DD format - only if explicitly stated in document"
                  },
                  nextInvoiceDate: { 
                    type: "string",
                    description: "Next invoice date in YYYY-MM-DD format - only if explicitly stated in document"
                  },
                  modules: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of modules - only if explicitly listed in document"
                  },
                  addons: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of add-ons - only if explicitly listed in document"
                  },
                  customPricing: { 
                    type: "object",
                    description: "Custom pricing details - only if explicitly stated in document. Do not include typical or template values."
                  },
                  volumeDiscounts: { 
                    type: "object",
                    description: "Volume discount details - only if explicitly stated in document"
                  },
                  minimumCharge: { 
                    type: "number",
                    description: "Minimum charge amount - only if explicitly stated in document"
                  },
                  minimumAnnualValue: { 
                    type: "number",
                    description: "Minimum annual value - only if explicitly stated in document"
                  },
                  notes: { 
                    type: "string",
                    description: "Notes and special terms - only if explicitly stated in document"
                  },
                  changes_summary: { 
                    type: "string",
                    description: "Summary of changes compared to original contract - only for amendments"
                  }
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

    // Post-processing validation to prevent hallucination
    const suspiciousFields = [
      'implementationFee', 'implementation_fee', 'setupFee', 'setup_fee',
      'onboardingFee', 'onboarding_fee', 'setupCost', 'setup_cost'
    ];
    
    // Remove any suspicious fields that shouldn't be in standard contracts
    for (const field of suspiciousFields) {
      if (field in extractedData) {
        console.log(`Warning: Removing suspicious field "${field}" that may be hallucinated`);
        delete (extractedData as any)[field];
      }
    }

    // Validate numeric fields are reasonable
    const numericFields = ['initialMW', 'minimumCharge', 'minimumAnnualValue'];
    for (const field of numericFields) {
      const value = (extractedData as any)[field];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 0 || !isFinite(value)) {
          console.log(`Warning: Removing invalid numeric field "${field}" with value:`, value);
          delete (extractedData as any)[field];
        }
      }
    }

    console.log("Extracted contract data (after validation):", extractedData);

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