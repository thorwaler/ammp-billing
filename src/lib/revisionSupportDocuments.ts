/**
 * Support document regeneration for revised invoices.
 *
 * When an invoice is revised the Xero lines change, so the support documents
 * that back those lines have to be rebuilt too: new PDFs, re-attached to the
 * Xero invoice and re-uploaded to SharePoint, with the document data stored on
 * the revised invoice row so it stays downloadable from Invoice History.
 */

import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { generateSupportDocumentData, type SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { renderSupportDocumentToPdf } from "@/components/invoices/PdfRenderer";
import { uploadMultipleToSharePoint } from "@/utils/sharePointUpload";
import type { MergedRevisionComputation, RevisionUnit } from "@/lib/invoiceRevision";

export interface RevisionSupportDocResult {
  generated: number;
  attachedToXero: number;
  uploadedToSharePoint: number;
  errors: string[];
}

function idsOf(list: any): string[] {
  return Array.isArray(list) ? list.map((m: any) => (typeof m === "string" ? m : m?.id)).filter(Boolean) : [];
}

function addonsOf(list: any): Array<{ id: string; quantity?: number }> {
  return Array.isArray(list)
    ? list
        .map((a: any) => (typeof a === "string" ? { id: a } : { id: a?.id, quantity: a?.quantity }))
        .filter((a) => !!a.id)
    : [];
}

export async function regenerateRevisionSupportDocuments(args: {
  revisedInvoiceId: string;
  customerId: string;
  customerName: string;
  currency: string;
  invoiceDate: Date;
  billingFrequency: string;
  isMerged: boolean;
  units: RevisionUnit[];
  computation: MergedRevisionComputation;
  liveByContract: Record<string, { contract?: any }>;
  fallbackContract?: any;
  xeroInvoiceId: string | null;
}): Promise<RevisionSupportDocResult> {
  const {
    revisedInvoiceId,
    customerId,
    customerName,
    currency,
    invoiceDate,
    billingFrequency,
    isMerged,
    units,
    computation,
    liveByContract,
    fallbackContract,
    xeroInvoiceId,
  } = args;

  const result: RevisionSupportDocResult = {
    generated: 0,
    attachedToXero: 0,
    uploadedToSharePoint: 0,
    errors: [],
  };

  const docs: Array<{ contractId: string; contractName: string; data: SupportDocumentData }> = [];

  for (const entry of computation.units) {
    const { contractId, contractName, computation: comp } = entry;
    const row = liveByContract[contractId]?.contract || fallbackContract || {};
    const unit = units.find((u) => u.contractId === contractId);
    const label = contractName || row?.contract_name || row?.company_name || "Support Document";

    try {
      const data = await generateSupportDocumentData(
        customerId,
        customerName,
        (currency as "EUR" | "USD") || "EUR",
        invoiceDate,
        comp.result,
        idsOf(row?.modules ?? (unit?.contract as any)?.modules),
        addonsOf(row?.addons ?? (unit?.contract as any)?.addons),
        {
          ...(row?.cached_capabilities || {}),
          assetBreakdown: comp.params.assetBreakdown,
          orgBreakdown: comp.params.orgBreakdown,
        },
        comp.params.packageType,
        unit?.billingFrequency || billingFrequency,
        0,
        (unit?.periodStart as string) || undefined,
        (unit?.periodEnd as string) || undefined,
        contractId,
        row?.retainer_hours ?? undefined,
        row?.retainer_hourly_rate ?? undefined,
        row?.retainer_minimum_value ?? undefined,
        label,
        row?.minimum_annual_value ?? undefined,
      );
      docs.push({ contractId, contractName: label, data });
    } catch (e: any) {
      console.error("[Revision] Support document generation failed:", e);
      result.errors.push(`${label}: ${e?.message || "support document failed"}`);
    }
  }

  result.generated = docs.length;
  if (docs.length === 0) return result;

  // Store on the revised invoice: merged invoices keep the per-contract array
  // shape, single-contract invoices keep the plain object.
  const stored = isMerged
    ? docs.map((d) => ({ contractId: d.contractId, contractName: d.contractName, data: d.data }))
    : docs[0].data;

  const { error: saveError } = await supabase
    .from("invoices")
    .update({ support_document_data: stored as any })
    .eq("id", revisedInvoiceId);
  if (saveError) result.errors.push(saveError.message);

  // Render PDFs.
  const pdfs: Array<{ contractName: string; pdfBase64: string }> = [];
  for (const doc of docs) {
    try {
      pdfs.push({ contractName: doc.contractName, pdfBase64: await renderSupportDocumentToPdf(doc.data) });
    } catch (e: any) {
      console.error("[Revision] PDF render failed:", e);
      result.errors.push(`${doc.contractName}: PDF render failed`);
    }
  }
  if (pdfs.length === 0) return result;

  // Re-attach to the Xero invoice (same file names overwrite the originals).
  if (xeroInvoiceId) {
    try {
      const { data: attachResult, error: attachError } = await supabase.functions.invoke(
        "xero-attach-support-document",
        { body: { xeroInvoiceId, pdfBase64Array: pdfs } },
      );
      if (attachError) throw attachError;
      result.attachedToXero = attachResult?.attachedCount || 0;
    } catch (e: any) {
      console.error("[Revision] Xero attachment failed:", e);
      result.errors.push("Xero attachment failed");
    }
  }

  // Upload the revised PDFs to SharePoint.
  try {
    const safe = (s: string) => String(s || "").replace(/[^a-zA-Z0-9\s]/g, "");
    const sharePointDocs = pdfs.map((doc) => ({
      pdfBase64: doc.pdfBase64,
      fileName: `${safe(customerName)}_${safe(doc.contractName)}_SupportDoc_${format(invoiceDate, "yyyy-MM-dd")}_revised.pdf`,
      documentType: "support_document" as const,
    }));

    const uploads = await uploadMultipleToSharePoint(sharePointDocs);
    result.uploadedToSharePoint = uploads.filter((u) => u.success).length;

    const files = uploads
      .map((u, i) =>
        u.success && u.fileId && u.driveId
          ? { driveId: u.driveId, fileId: u.fileId, fileName: u.fileName || sharePointDocs[i].fileName }
          : null,
      )
      .filter(Boolean);
    if (files.length > 0) {
      await supabase
        .from("invoices")
        .update({ sharepoint_files: files as any })
        .eq("id", revisedInvoiceId);
    }
  } catch (e) {
    console.error("[Revision] SharePoint upload failed:", e);
  }

  return result;
}
