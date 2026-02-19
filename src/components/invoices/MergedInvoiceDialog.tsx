import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, FileText, Download, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { calculateInvoice, CalculationResult } from "@/lib/invoiceCalculations";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { SupportDocumentDownloadDialog } from "./SupportDocumentDownloadDialog";
import { generateSupportDocumentData, SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { renderSupportDocumentToPdf } from "@/components/invoices/PdfRenderer";
import type { MinimumChargeTier, DiscountTier, GraduatedMWTier } from "@/data/pricingData";
import { isPackage2026 } from "@/data/pricingData";
import { uploadMultipleToSharePoint } from "@/utils/sharePointUpload";
import { useCurrency } from "@/contexts/CurrencyContext";

interface ContractForMerge {
  contractId: string;
  contractName?: string;
  customerId: string;
  customerName: string;
  nextInvoiceDate: string;
  billingFrequency: string;
  currency: string;
  packageType: string;
  mwpManaged?: number;
  initialMW?: number;
  modules?: any[];
  addons?: any[];
  minimumCharge?: number;
  minimumChargeTiers?: MinimumChargeTier[];
  portfolioDiscountTiers?: DiscountTier[];
  minimumAnnualValue?: number;
  customPricing?: any;
  cachedCapabilities?: any;
  baseMonthlyPrice?: number;
  siteChargeFrequency?: "monthly" | "annual";
  retainerHours?: number;
  retainerHourlyRate?: number;
  retainerMinimumValue?: number;
  siteSizeThresholdKwp?: number;
  belowThresholdPricePerMWp?: number;
  aboveThresholdPricePerMWp?: number;
  graduatedMWTiers?: GraduatedMWTier[];
  annualFeePerSite?: number;
  // AMMP OS 2026 trial fields
  isTrial?: boolean;
  trialSetupFee?: number;
  vendorApiOnboardingFee?: number;
  // SolarAfrica API fields
  municipalityCount?: number;
  apiSetupFee?: number;
  hourlyRate?: number;
}

interface MergedInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contracts: ContractForMerge[];
  onInvoiceCreated?: () => void;
}

const ACCOUNT_PLATFORM_FEES = "1002";
const ACCOUNT_IMPLEMENTATION_FEES = "1000";

export function MergedInvoiceDialog({
  open,
  onOpenChange,
  contracts,
  onInvoiceCreated,
}: MergedInvoiceDialogProps) {
  const { exchangeRate } = useCurrency();
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set());
  const [calculationResults, setCalculationResults] = useState<Map<string, CalculationResult>>(new Map());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [supportDocuments, setSupportDocuments] = useState<Map<string, SupportDocumentData>>(new Map());
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [currentSupportDoc, setCurrentSupportDoc] = useState<SupportDocumentData | null>(null);
  const [currentSupportDocContract, setCurrentSupportDocContract] = useState<ContractForMerge | null>(null);
  const [attachSupportDoc, setAttachSupportDoc] = useState(true);

  // Initialize all contracts as selected
  useEffect(() => {
    if (open && contracts.length > 0) {
      setSelectedContracts(new Set(contracts.map(c => c.contractId)));
      calculateAllContracts();
    }
  }, [open, contracts]);

  const calculateAllContracts = async () => {
    setLoading(true);
    const results = new Map<string, CalculationResult>();
    const docs = new Map<string, SupportDocumentData>();
    
    for (const contract of contracts) {
      const result = calculateContractInvoice(contract);
      results.set(contract.contractId, result);
      
      // Generate support document data
      const supportDocData = await generateSupportDocumentForContract(contract, result);
      if (supportDocData) {
        docs.set(contract.contractId, supportDocData);
      }
    }
    
    setCalculationResults(results);
    setSupportDocuments(docs);
    setLoading(false);
  };

  const calculateContractInvoice = (contract: ContractForMerge): CalculationResult => {
    const frequencyMultipliers: Record<string, number> = {
      monthly: 1/12,
      quarterly: 0.25,
      biannual: 0.5,
      annual: 1
    };
    
    const multiplier = frequencyMultipliers[contract.billingFrequency] || 1;
    
    const assetBreakdown = contract.cachedCapabilities?.assetBreakdown?.map((asset: any) => ({
      assetId: asset.assetId,
      assetName: asset.assetName,
      totalMW: asset.totalMW,
      isHybrid: asset.isHybrid
    }));
    
    const totalMW = assetBreakdown?.reduce((sum: number, a: any) => sum + (a.totalMW || 0), 0) 
      || contract.mwpManaged || 0;
    
    const selectedModules = Array.isArray(contract.modules) 
      ? contract.modules.map((m: any) => typeof m === 'string' ? m : m.id)
      : [];
    
    const selectedAddons = Array.isArray(contract.addons)
      ? contract.addons.map((a: any) => ({
          id: typeof a === 'string' ? a : a.id,
          complexity: a.complexity,
          customPrice: a.customPrice,
          quantity: a.quantity,
          customTiers: a.customTiers
        }))
      : [];
    
    return calculateInvoice({
      packageType: contract.packageType as any,
      totalMW,
      selectedModules,
      selectedAddons,
      customPricing: contract.customPricing,
      minimumCharge: contract.minimumCharge || 0,
      minimumChargeTiers: contract.minimumChargeTiers || [],
      portfolioDiscountTiers: contract.portfolioDiscountTiers || [],
      minimumAnnualValue: contract.minimumAnnualValue || 0,
      frequencyMultiplier: multiplier,
      ammpCapabilities: contract.cachedCapabilities,
      assetBreakdown,
      enableSiteMinimumPricing: !!assetBreakdown && assetBreakdown.length > 0,
      baseMonthlyPrice: contract.baseMonthlyPrice || 0,
      billingFrequency: contract.billingFrequency,
      siteChargeFrequency: contract.siteChargeFrequency || "annual",
      retainerHours: contract.retainerHours || 0,
      retainerHourlyRate: contract.retainerHourlyRate || 0,
      retainerMinimumValue: contract.retainerMinimumValue || 0,
      siteSizeThresholdKwp: contract.siteSizeThresholdKwp,
      belowThresholdPricePerMWp: contract.belowThresholdPricePerMWp,
      aboveThresholdPricePerMWp: contract.aboveThresholdPricePerMWp,
      graduatedMWTiers: contract.graduatedMWTiers,
      annualFeePerSite: contract.annualFeePerSite,
      // AMMP OS 2026 trial fields
      isTrial: contract.isTrial,
      trialSetupFee: contract.trialSetupFee,
      vendorApiOnboardingFee: contract.vendorApiOnboardingFee,
      // SolarAfrica API fields
      municipalityCount: contract.municipalityCount,
      apiSetupFee: contract.apiSetupFee,
      hourlyRate: contract.hourlyRate,
    });
  };

  const generateSupportDocumentForContract = async (
    contract: ContractForMerge, 
    result: CalculationResult
  ): Promise<SupportDocumentData | null> => {
    try {
      const selectedModules = Array.isArray(contract.modules) 
        ? contract.modules.map((m: any) => typeof m === 'string' ? m : m.id)
        : [];
      
      const selectedAddons = Array.isArray(contract.addons)
        ? contract.addons.map((a: any) => ({
            id: typeof a === 'string' ? a : a.id,
            quantity: a.quantity
          }))
        : [];
      
      return await generateSupportDocumentData(
        contract.customerId,
        contract.customerName,
        contract.currency as 'EUR' | 'USD',
        new Date(contract.nextInvoiceDate),
        result,
        selectedModules,
        selectedAddons,
        contract.cachedCapabilities,
        contract.packageType,
        contract.billingFrequency,
        0, // discountPercent
        undefined, // periodStart
        undefined, // periodEnd
        contract.contractId,
        contract.retainerHours,
        contract.retainerHourlyRate,
        contract.retainerMinimumValue,
        contract.contractName,
        contract.minimumAnnualValue
      );
    } catch (error) {
      console.error('Error generating support document:', error);
      return null;
    }
  };

  const toggleContract = (contractId: string) => {
    const newSelected = new Set(selectedContracts);
    if (newSelected.has(contractId)) {
      newSelected.delete(contractId);
    } else {
      newSelected.add(contractId);
    }
    setSelectedContracts(newSelected);
  };

  const selectedContractsList = useMemo(() => {
    return contracts.filter(c => selectedContracts.has(c.contractId));
  }, [contracts, selectedContracts]);

  const totalAmount = useMemo(() => {
    return selectedContractsList.reduce((sum, c) => {
      const result = calculationResults.get(c.contractId);
      return sum + (result?.totalPrice || 0);
    }, 0);
  }, [selectedContractsList, calculationResults]);

  // All contracts should have the same currency (enforced by grouping logic)
  const primaryCurrency = contracts[0]?.currency || 'EUR';
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';
  const customerName = contracts[0]?.customerName || 'Customer';
  const invoiceDate = new Date(contracts[0]?.nextInvoiceDate || new Date());
  
  // Defensive check: warn if mixed currencies somehow passed through
  const hasMixedCurrencies = useMemo(() => {
    const currencies = new Set(contracts.map(c => c.currency));
    return currencies.size > 1;
  }, [contracts]);

  const buildMergedLineItems = () => {
    const lineItems: any[] = [];
    
    for (const contract of selectedContractsList) {
      const result = calculationResults.get(contract.contractId);
      if (!result) continue;
      
      const contractLabel = contract.contractName || contract.packageType;
      
      // Add module costs
      if (result.moduleCosts && result.moduleCosts.length > 0) {
        result.moduleCosts.forEach((mc: any) => {
          lineItems.push({
            Description: `[${contractLabel}] ${mc.moduleName}`,
            Quantity: 1,
            UnitAmount: mc.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        });
      }
      
      // Add site minimum pricing if applicable
      if (result.siteMinimumPricingBreakdown) {
        if (result.siteMinimumPricingBreakdown.normalPricingTotal > 0) {
          lineItems.push({
            Description: `[${contractLabel}] Monitoring Fee - Sites Above Threshold (${result.siteMinimumPricingBreakdown.sitesAboveThreshold} sites)`,
            Quantity: 1,
            UnitAmount: result.siteMinimumPricingBreakdown.normalPricingTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        if (result.siteMinimumPricingBreakdown.minimumPricingTotal > 0) {
          lineItems.push({
            Description: `[${contractLabel}] Monitoring Fee - Sites Below Threshold (${result.siteMinimumPricingBreakdown.sitesBelowThreshold} sites, minimum charge)`,
            Quantity: 1,
            UnitAmount: result.siteMinimumPricingBreakdown.minimumPricingTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Add hybrid tiered breakdown
      if (result.hybridTieredBreakdown) {
        if (result.hybridTieredBreakdown.ongrid.cost > 0) {
          lineItems.push({
            Description: `[${contractLabel}] On-Grid Sites Monitoring (${result.hybridTieredBreakdown.ongrid.mw.toFixed(2)} MW)`,
            Quantity: 1,
            UnitAmount: result.hybridTieredBreakdown.ongrid.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        if (result.hybridTieredBreakdown.hybrid.cost > 0) {
          lineItems.push({
            Description: `[${contractLabel}] Hybrid Sites Monitoring (${result.hybridTieredBreakdown.hybrid.mw.toFixed(2)} MW)`,
            Quantity: 1,
            UnitAmount: result.hybridTieredBreakdown.hybrid.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Add Elum Internal graduated MW tier line items
      if (result.elumInternalBreakdown) {
        result.elumInternalBreakdown.tiers.forEach((tier: any) => {
          if (tier.cost > 0) {
            lineItems.push({
              Description: `[${contractLabel}] ${tier.label || `${tier.minMW}-${tier.maxMW === Infinity ? '∞' : tier.maxMW} MW`} (${tier.mwInTier.toFixed(2)} MW × €${tier.pricePerMW}/MW)`,
              Quantity: 1,
              UnitAmount: tier.cost,
              AccountCode: ACCOUNT_PLATFORM_FEES
            });
          }
        });
      }
      
      // Add Elum ePM site pricing line items
      if (result.elumEpmBreakdown) {
        if (result.elumEpmBreakdown.smallSitesTotal > 0) {
          lineItems.push({
            Description: `[${contractLabel}] Small Sites ≤${result.elumEpmBreakdown.threshold}kWp (${result.elumEpmBreakdown.smallSites?.length || 0} sites)`,
            Quantity: 1,
            UnitAmount: result.elumEpmBreakdown.smallSitesTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        if (result.elumEpmBreakdown.largeSitesTotal > 0) {
          lineItems.push({
            Description: `[${contractLabel}] Large Sites >${result.elumEpmBreakdown.threshold}kWp (${result.elumEpmBreakdown.largeSites?.length || 0} sites)`,
            Quantity: 1,
            UnitAmount: result.elumEpmBreakdown.largeSitesTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Add Elum Jubaili per-site fee
      if (result.elumJubailiBreakdown) {
        lineItems.push({
          Description: `[${contractLabel}] Per-Site Fee (${result.elumJubailiBreakdown.siteCount} sites × €${result.elumJubailiBreakdown.perSiteFee}/site)`,
          Quantity: 1,
          UnitAmount: result.elumJubailiBreakdown.totalCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add base monthly price
      if (result.basePricingCost && result.basePricingCost > 0) {
        lineItems.push({
          Description: `[${contractLabel}] Base Monthly Fee`,
          Quantity: 1,
          UnitAmount: result.basePricingCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add minimum contract adjustment
      if (result.minimumContractAdjustment && result.minimumContractAdjustment > 0) {
        lineItems.push({
          Description: `[${contractLabel}] Minimum Contract Adjustment`,
          Quantity: 1,
          UnitAmount: result.minimumContractAdjustment,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add retainer cost
      if (result.retainerCost && result.retainerCost > 0) {
        lineItems.push({
          Description: `[${contractLabel}] Retainer Hours`,
          Quantity: 1,
          UnitAmount: result.retainerCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add addon costs
      if (result.addonCosts && result.addonCosts.length > 0) {
        result.addonCosts.forEach((ac: any) => {
          lineItems.push({
            Description: `[${contractLabel}] ${ac.name}`,
            Quantity: 1,
            UnitAmount: ac.cost,
            AccountCode: ac.addonId === 'satelliteDataAPI' ? ACCOUNT_PLATFORM_FEES : ACCOUNT_IMPLEMENTATION_FEES
          });
        });
      }
    }
    
    // Add trial fee line items for 2026 trial contracts
    for (const contract of selectedContractsList) {
      if (contract.isTrial && isPackage2026(contract.packageType)) {
        const contractLabel = contract.contractName || contract.packageType;
        if (contract.trialSetupFee) {
          lineItems.push({
            Description: `[${contractLabel}] Trial Setup Fee`,
            Quantity: 1,
            UnitAmount: contract.trialSetupFee,
            AccountCode: ACCOUNT_IMPLEMENTATION_FEES
          });
        }
        if (contract.vendorApiOnboardingFee) {
          lineItems.push({
            Description: `[${contractLabel}] Vendor API Onboarding Fee`,
            Quantity: 1,
            UnitAmount: contract.vendorApiOnboardingFee,
            AccountCode: ACCOUNT_IMPLEMENTATION_FEES
          });
        }
      }
    }
    
    return lineItems;
  };

  const handleSendToXero = async () => {
    if (selectedContractsList.length === 0) {
      toast({
        title: "No contracts selected",
        description: "Please select at least one contract to create an invoice.",
        variant: "destructive",
      });
      return;
    }
    
    setSending(true);
    
    // Show sending toast
    toast({
      title: "Sending invoice to Xero...",
      description: "Creating merged invoice draft in Xero.",
    });
    try {
      const lineItems = buildMergedLineItems();
      
      // Calculate ARR and NRR
      let totalARR = 0;
      let totalNRR = 0;
      
      for (const contract of selectedContractsList) {
        const result = calculationResults.get(contract.contractId);
        if (!result) continue;
        
        const solcastCost = result.addonCosts?.find(ac => ac.addonId === 'satelliteDataAPI')?.cost || 0;
        
        const contractARR = (result.basePricingCost || 0) +
          (result.starterPackageCost || 0) +
          (result.moduleCosts?.reduce((sum, mc) => sum + mc.cost, 0) || 0) +
          (result.hybridTieredBreakdown?.ongrid.cost || 0) +
          (result.hybridTieredBreakdown?.hybrid.cost || 0) +
          (result.elumInternalBreakdown?.totalCost || 0) +
          (result.elumEpmBreakdown?.totalCost || 0) +
          (result.elumJubailiBreakdown?.totalCost || 0) +
          (result.minimumContractAdjustment || 0) +
          (result.minimumCharges || 0) +
          (result.retainerCost || 0) +
          (result.discountedAssetsTotal || 0) +
          (result.perSiteBreakdown?.onboardingCost || 0) +
          (result.perSiteBreakdown?.annualSubscriptionCost || 0) +
          solcastCost;
        
        let contractNRR = (result.addonCosts || [])
          .filter(ac => ac.addonId !== 'satelliteDataAPI')
          .reduce((sum, ac) => sum + ac.cost, 0);
        
        // Add trial fees to NRR for 2026 trial contracts
        if (contract.isTrial && isPackage2026(contract.packageType)) {
          contractNRR += (contract.trialSetupFee || 0) + (contract.vendorApiOnboardingFee || 0);
        }
        
        totalARR += contractARR;
        totalNRR += contractNRR;
      }
      
      const xeroInvoice = {
        Type: "ACCREC",
        Contact: { Name: customerName },
        Date: format(invoiceDate, "yyyy-MM-dd"),
        DueDate: format(new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
        LineItems: lineItems,
        Reference: `${customerName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 20)}-Merged-${format(invoiceDate, "yyyyMMdd")}`,
        CurrencyCode: primaryCurrency,
        Status: "DRAFT"
      };
      
      // STEP 1: Send invoice to Xero (without attachment)
      const { data, error } = await supabase.functions.invoke('xero-send-invoice', {
        body: { invoice: xeroInvoice }
      });

      if (error) throw error;
      
      const xeroInvoiceId = data?.invoice?.Invoices?.[0]?.InvoiceID;
      
      // Show invoice creation success
      toast({
        title: "Invoice created in Xero",
        description: "Merged invoice has been created as a draft.",
      });
      
      // Update period dates for all included contracts
      for (const contract of selectedContractsList) {
        const currentPeriodEnd = new Date(contract.nextInvoiceDate);
        const nextPeriodStart = new Date(currentPeriodEnd);
        nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
        
        let nextPeriodEnd = new Date(nextPeriodStart);
        switch (contract.billingFrequency) {
          case 'monthly':
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
            break;
          case 'quarterly':
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 3);
            break;
          case 'biannual':
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 6);
            break;
          case 'annual':
            nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
            break;
        }
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() - 1);
        
        await supabase
          .from('contracts')
          .update({
            period_start: nextPeriodStart.toISOString(),
            period_end: nextPeriodEnd.toISOString(),
            next_invoice_date: nextPeriodEnd.toISOString()
          })
          .eq('id', contract.contractId);
      }
      
      // Save merged invoice record
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Calculate total MW from all contracts
        const totalMW = selectedContractsList.reduce((sum, c) => {
          const assetBreakdown = c.cachedCapabilities?.assetBreakdown || [];
          return sum + assetBreakdown.reduce((s: number, a: any) => s + (a.totalMW || 0), 0);
        }, 0);
        
        // Calculate EUR amounts using dynamic exchange rate
        const eurMultiplier = primaryCurrency === 'USD' ? exchangeRate : 1;
        
        await supabase.from('invoices').insert([{
          user_id: user.id,
          customer_id: contracts[0].customerId,
          contract_id: contracts[0].contractId, // Primary contract
          invoice_date: format(invoiceDate, "yyyy-MM-dd"),
          invoice_amount: totalAmount,
          invoice_amount_eur: totalAmount * eurMultiplier,
          arr_amount: totalARR,
          arr_amount_eur: totalARR * eurMultiplier,
          nrr_amount: totalNRR,
          nrr_amount_eur: totalNRR * eurMultiplier,
          mw_managed: totalMW,
          total_mw: totalMW,
          billing_frequency: contracts[0].billingFrequency,
          currency: primaryCurrency,
          source: 'internal',
          xero_invoice_id: xeroInvoiceId,
          xero_reference: xeroInvoice.Reference,
          xero_status: 'DRAFT',
          xero_synced_at: new Date().toISOString(),
          xero_line_items: lineItems as any,
          merged_contract_ids: selectedContractsList.map(c => c.contractId),
          support_document_data: Array.from(supportDocuments.entries())
            .filter(([id]) => selectedContracts.has(id))
            .map(([id, doc]) => ({ contractId: id, data: doc })) as any
        }]);
        
        // STEP 3 & 4: Generate support documents and PDFs AFTER saving to DB (so YTD includes this invoice)
        let generatedPdfs: Array<{ contractName: string; pdfBase64: string }> = [];
        
        if (attachSupportDoc) {
          try {
            const supportDocumentDataArray = selectedContractsList.map(c => ({
              contractName: c.contractName || c.packageType,
              data: supportDocuments.get(c.contractId)
            })).filter(d => d.data);
            
            if (supportDocumentDataArray.length > 0) {
              toast({
                title: "Generating support documents...",
                description: `Creating ${supportDocumentDataArray.length} PDF(s) for Xero attachment.`,
              });
              
              const pdfBase64Array: Array<{ contractName: string; pdfBase64: string }> = [];
              for (const doc of supportDocumentDataArray) {
                if (doc.data) {
                  const pdfBase64 = await renderSupportDocumentToPdf(doc.data);
                  pdfBase64Array.push({
                    contractName: doc.contractName || 'Support Document',
                    pdfBase64
                  });
                }
              }
              
              // Store for SharePoint upload later
              generatedPdfs = pdfBase64Array;
              
              // STEP 5: Attach PDFs to Xero invoice separately
              if (pdfBase64Array.length > 0 && xeroInvoiceId) {
                toast({
                  title: "Attaching support documents...",
                  description: "Uploading PDFs to Xero invoice.",
                });
                
                const { data: attachResult, error: attachError } = await supabase.functions.invoke('xero-attach-support-document', {
                  body: {
                    xeroInvoiceId,
                    pdfBase64Array
                  }
                });
                
                if (attachError) {
                  console.error('Attachment error:', attachError);
                  toast({
                    title: "Attachment failed",
                    description: "Invoice saved but support documents could not be attached.",
                    variant: "destructive",
                  });
                } else if (attachResult?.attachedCount > 0) {
                  toast({
                    title: "Support documents attached",
                    description: `Successfully attached ${attachResult.attachedCount} document(s) to the Xero invoice.`,
                  });
                } else if (attachResult?.needsReconnect) {
                  toast({
                    title: "Attachment failed - Reconnection needed",
                    description: "Please reconnect Xero in Settings → Integrations to enable attachments.",
                    variant: "destructive",
                  });
                } else if (attachResult?.failedCount > 0) {
                  toast({
                    title: "Attachment failed",
                    description: attachResult.errors?.[0] || "Failed to attach support documents.",
                    variant: "destructive",
                  });
                }
              }
            }
          } catch (pdfError) {
            console.error('Error generating/attaching PDFs:', pdfError);
            toast({
              title: "Support document error",
              description: "Invoice saved but support documents could not be generated.",
              variant: "destructive",
            });
          }
        }
        
        // STEP 6: Upload to SharePoint (non-blocking, separate from Xero attachment)
        if (generatedPdfs.length > 0) {
          try {
            const sharePointDocs = generatedPdfs.map(doc => ({
              pdfBase64: doc.pdfBase64,
              fileName: `${customerName.replace(/[^a-zA-Z0-9\s]/g, '')}_${doc.contractName.replace(/[^a-zA-Z0-9\s]/g, '')}_SupportDoc_${format(invoiceDate, 'yyyy-MM-dd')}.pdf`,
              documentType: 'support_document' as const
            }));
            
            const sharePointResults = await uploadMultipleToSharePoint(sharePointDocs);
            
            const successCount = sharePointResults.filter(r => r.success).length;
            const failedCount = sharePointResults.filter(r => !r.success && !r.skipped).length;
            
            if (successCount > 0) {
              toast({
                title: "Uploaded to SharePoint",
                description: `${successCount} support document(s) uploaded successfully.`,
              });
            }
            
            if (failedCount > 0) {
              toast({
                title: "SharePoint upload issue",
                description: `${failedCount} document(s) failed to upload.`,
                variant: "destructive",
              });
            }
          } catch (spError) {
            console.error('[SharePoint] Error uploading documents:', spError);
            // Don't show error toast - SharePoint is optional
          }
        }
      }
      
      onOpenChange(false);
      onInvoiceCreated?.();
      
    } catch (error: any) {
      console.error('Error sending merged invoice:', error);
      toast({
        title: "Error sending invoice",
        description: error.message || "Failed to send invoice to Xero",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleDownloadSupportDoc = (contractId: string) => {
    const doc = supportDocuments.get(contractId);
    const contract = contracts.find(c => c.contractId === contractId);
    if (doc && contract) {
      setCurrentSupportDoc(doc);
      setCurrentSupportDocContract(contract);
      setDownloadDialogOpen(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Create Merged Invoice
            </DialogTitle>
            <DialogDescription>
              Combine multiple contracts into a single Xero invoice for {customerName}
            </DialogDescription>
          </DialogHeader>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Warning for mixed currencies (defensive) */}
              {hasMixedCurrencies && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                  Warning: These contracts have mixed currencies. Please invoice them separately.
                </div>
              )}
              
              {/* Contract selection */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Select contracts to include:</h4>
                <ScrollArea className="h-[300px] border rounded-lg p-3">
                  {contracts.map((contract) => {
                    const result = calculationResults.get(contract.contractId);
                    const isSelected = selectedContracts.has(contract.contractId);
                    
                    return (
                      <div 
                        key={contract.contractId}
                        className={`flex items-center justify-between p-3 rounded-lg mb-2 border ${isSelected ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={`merge-${contract.contractId}`}
                            checked={isSelected}
                            onCheckedChange={() => toggleContract(contract.contractId)}
                          />
                          <div>
                            <label 
                              htmlFor={`merge-${contract.contractId}`}
                              className="text-sm font-medium cursor-pointer"
                            >
                              {contract.contractName || contract.packageType}
                            </label>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{contract.packageType}</Badge>
                              <Badge variant="outline" className="text-xs capitalize">{contract.billingFrequency}</Badge>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">
                            {contract.currency === 'EUR' ? '€' : '$'}
                            {result?.totalPrice.toLocaleString() || '-'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadSupportDoc(contract.contractId)}
                            disabled={!supportDocuments.has(contract.contractId)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </ScrollArea>
              </div>
              
              <Separator />
              
              {/* Total */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Invoice Amount</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedContractsList.length} contract{selectedContractsList.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {currencySymbol}{totalAmount.toLocaleString()}
                  </p>
                </div>
              </div>
              
              {/* Attach Support Document Option */}
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="attach-support-doc-merged"
                  checked={attachSupportDoc}
                  onCheckedChange={(checked) => setAttachSupportDoc(checked === true)}
                />
                <label htmlFor="attach-support-doc-merged" className="text-sm cursor-pointer">
                  Attach support documents to Xero invoice
                </label>
              </div>
              
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendToXero} 
                  disabled={sending || selectedContractsList.length === 0}
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Merged Invoice to Xero
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {currentSupportDoc && currentSupportDocContract && (
        <SupportDocumentDownloadDialog
          open={downloadDialogOpen}
          onOpenChange={setDownloadDialogOpen}
          documentData={currentSupportDoc}
          customerName={currentSupportDocContract.customerName}
          invoicePeriod={format(new Date(currentSupportDocContract.nextInvoiceDate), "MMM yyyy")}
        />
      )}
    </>
  );
}
