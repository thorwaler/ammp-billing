import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText, Files, Loader2 } from "lucide-react";
import { SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { exportToExcel, exportToPDF, generateFilename, ExportFormat } from "@/lib/supportDocumentExport";
import { toast } from "sonner";

/** A merged invoice stores one entry per contract. */
interface MergedSupportDocumentEntry {
  contractId?: string;
  contractName?: string;
  data: SupportDocumentData;
}

interface SupportDocumentDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Either a single support document, or the merged per-contract array. */
  documentData: SupportDocumentData | MergedSupportDocumentEntry[] | null;
  customerName: string;
  invoicePeriod: string;
}

/** Normalise single vs merged shapes into a list of selectable documents. */
function normaliseDocuments(
  documentData: SupportDocumentData | MergedSupportDocumentEntry[] | null,
): Array<{ key: string; label: string; data: SupportDocumentData }> {
  if (!documentData) return [];

  if (Array.isArray(documentData)) {
    return documentData
      .map((entry, index) => {
        // Tolerate legacy rows that stored bare documents inside the array.
        const data = (entry as MergedSupportDocumentEntry)?.data ?? (entry as unknown as SupportDocumentData);
        if (!data) return null;
        const label =
          (entry as MergedSupportDocumentEntry)?.contractName ||
          (data as any)?.contractName ||
          `Contract ${index + 1}`;
        return {
          key: (entry as MergedSupportDocumentEntry)?.contractId || `contract-${index}`,
          label,
          data,
        };
      })
      .filter(Boolean) as Array<{ key: string; label: string; data: SupportDocumentData }>;
  }

  return [{ key: "single", label: "Support document", data: documentData }];
}

/** Strip characters that are not safe inside a file name. */
function sanitiseForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/^_+|_+$/g, "");
}

export function SupportDocumentDownloadDialog({
  open,
  onOpenChange,
  documentData,
  customerName,
  invoicePeriod
}: SupportDocumentDownloadDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('xlsx');
  const [downloading, setDownloading] = useState(false);

  const documents = useMemo(() => normaliseDocuments(documentData), [documentData]);
  const isMerged = documents.length > 1;
  const ALL_CONTRACTS = "__all__";

  const [selectedKey, setSelectedKey] = useState<string>(ALL_CONTRACTS);

  useEffect(() => {
    if (open) {
      setSelectedKey(isMerged ? ALL_CONTRACTS : documents[0]?.key ?? ALL_CONTRACTS);
    }
  }, [open, isMerged, documents]);

  const handleDownload = async () => {
    if (documents.length === 0) {
      toast.error("No support document data is stored for this invoice");
      return;
    }

    setDownloading(true);
    try {
      const period = invoicePeriod.replace(/\s/g, '_');
      const targets =
        selectedKey === ALL_CONTRACTS ? documents : documents.filter((d) => d.key === selectedKey);

      if (targets.length === 0) {
        toast.error("Select a contract to download");
        return;
      }

      let fileCount = 0;
      for (const target of targets) {
        // Keep each contract's file distinguishable inside a merged invoice.
        const nameForFile = isMerged
          ? `${customerName}_${sanitiseForFilename(target.label)}`
          : customerName;

        if (selectedFormat === 'xlsx' || selectedFormat === 'both') {
          if (fileCount > 0) await new Promise((resolve) => setTimeout(resolve, 300));
          exportToExcel(target.data, generateFilename(nameForFile, period, 'xlsx'));
          fileCount++;
        }

        if (selectedFormat === 'pdf' || selectedFormat === 'both') {
          if (fileCount > 0) await new Promise((resolve) => setTimeout(resolve, 300));
          exportToPDF(target.data, generateFilename(nameForFile, period, 'pdf'));
          fileCount++;
        }
      }

      toast.success(
        fileCount > 1 ? `${fileCount} files downloaded successfully` : `${selectedFormat.toUpperCase()} downloaded successfully`
      );
      onOpenChange(false);
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download support document");
    } finally {
      setDownloading(false);
    }
  };

  const downloadLabel = (() => {
    const multiple = selectedKey === ALL_CONTRACTS && isMerged;
    if (selectedFormat === 'both') return multiple ? 'Download all files' : 'Download Both';
    if (multiple) return `Download all ${selectedFormat.toUpperCase()}`;
    return `Download ${selectedFormat.toUpperCase()}`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Download Support Document</DialogTitle>
          <DialogDescription>
            {isMerged
              ? "This invoice covers several contracts. Pick a contract and a file format."
              : "Choose your preferred file format"}
          </DialogDescription>
        </DialogHeader>

        {isMerged && (
          <div className="space-y-2 pt-2">
            <Label htmlFor="support-doc-contract">Contract</Label>
            <Select value={selectedKey} onValueChange={setSelectedKey}>
              <SelectTrigger id="support-doc-contract">
                <SelectValue placeholder="Select a contract" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CONTRACTS}>All contracts ({documents.length})</SelectItem>
                {documents.map((doc) => (
                  <SelectItem key={doc.key} value={doc.key}>
                    {doc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3 py-4">
          <Button
            variant={selectedFormat === 'xlsx' ? 'default' : 'outline'}
            onClick={() => setSelectedFormat('xlsx')}
            className="flex-1 h-20 flex-col gap-2"
          >
            <FileSpreadsheet className="h-6 w-6" />
            <span className="text-sm">Excel (.xlsx)</span>
          </Button>
          <Button
            variant={selectedFormat === 'pdf' ? 'default' : 'outline'}
            onClick={() => setSelectedFormat('pdf')}
            className="flex-1 h-20 flex-col gap-2"
          >
            <FileText className="h-6 w-6" />
            <span className="text-sm">PDF</span>
          </Button>
          <Button
            variant={selectedFormat === 'both' ? 'default' : 'outline'}
            onClick={() => setSelectedFormat('both')}
            className="flex-1 h-20 flex-col gap-2"
          >
            <Files className="h-6 w-6" />
            <span className="text-sm">Both</span>
          </Button>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={downloading || documents.length === 0}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {downloadLabel}
          </Button>
        </DialogFooter>
        
      </DialogContent>
    </Dialog>
  );
}
