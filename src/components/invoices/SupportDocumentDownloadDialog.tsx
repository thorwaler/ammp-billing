import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Files, Loader2 } from "lucide-react";
import { SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { exportToExcel, exportToPDF, generateFilename, ExportFormat } from "@/lib/supportDocumentExport";
import { SupportDocument } from "./SupportDocument";
import { toast } from "sonner";

interface SupportDocumentDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentData: SupportDocumentData;
  customerName: string;
  invoicePeriod: string;
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const period = invoicePeriod.replace(/\s/g, '_');
      
      if (selectedFormat === 'xlsx' || selectedFormat === 'both') {
        const xlsxFilename = generateFilename(customerName, period, 'xlsx');
        exportToExcel(documentData, xlsxFilename);
      }
      
      if (selectedFormat === 'pdf' || selectedFormat === 'both') {
        // Wait a moment if downloading both to avoid conflicts
        if (selectedFormat === 'both') {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        const pdfFilename = generateFilename(customerName, period, 'pdf');
        exportToPDF('support-document-preview', pdfFilename);
      }
      
      toast.success(
        selectedFormat === 'both' 
          ? "Both files downloaded successfully" 
          : `${selectedFormat.toUpperCase()} downloaded successfully`
      );
      onOpenChange(false);
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download support document");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Download Support Document</DialogTitle>
          <DialogDescription>
            Choose your preferred file format
          </DialogDescription>
        </DialogHeader>
        
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
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {selectedFormat === 'both' 
              ? 'Download Both' 
              : `Download ${selectedFormat.toUpperCase()}`}
          </Button>
        </DialogFooter>
        
        {/* Hidden SupportDocument for PDF rendering */}
        <div className="hidden">
          <div id="support-document-preview">
            <SupportDocument data={documentData} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
