import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { FileUp, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ContractPdfUploaderProps {
  onOcrComplete: (extractedData: any, pdfUrl: string) => void;
  contractId?: string;
}

export function ContractPdfUploader({ onOcrComplete, contractId }: ContractPdfUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');

  const sanitizeFileName = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    const name = fileName.substring(0, lastDotIndex);
    const ext = fileName.substring(lastDotIndex);
    
    const sanitized = name
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .toLowerCase();
    
    return sanitized + ext;
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a PDF file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    setOcrStatus('uploading');
    setUploading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Upload to Supabase Storage
      const timestamp = Date.now();
      const sanitizedName = sanitizeFileName(file.name);
      const fileName = `${user.id}/${timestamp}-${sanitizedName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('contract-pdfs')
        .upload(fileName, file, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('contract-pdfs')
        .getPublicUrl(fileName);

      setPdfUrl(publicUrl);
      setUploading(false);
      setOcrStatus('processing');
      setProcessing(true);

      toast({
        title: "PDF uploaded",
        description: "Processing contract data...",
      });

      // Call OCR edge function
      const { data: ocrData, error: ocrError } = await supabase.functions.invoke(
        'process-contract-ocr',
        {
          body: { 
            pdfUrl: publicUrl,
            contractId: contractId 
          }
        }
      );

      if (ocrError) throw ocrError;

      setProcessing(false);
      setOcrStatus('completed');

      toast({
        title: "Contract data extracted",
        description: "Form fields have been auto-populated. Please review and confirm.",
      });

      onOcrComplete(ocrData.extractedData, publicUrl);

    } catch (error) {
      console.error("Error processing PDF:", error);
      setUploading(false);
      setProcessing(false);
      setOcrStatus('error');
      
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to process contract PDF",
        variant: "destructive",
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: 10485760, // 10MB
    disabled: uploading || processing,
  });

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block">Contract Upload</Label>
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
            transition-colors
            ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
            ${(uploading || processing) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input {...getInputProps()} />
          
          {ocrStatus === 'idle' && (
            <>
              <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                {isDragActive ? 'Drop PDF here' : 'Drop PDF here or click to select'}
              </p>
              <p className="text-xs text-muted-foreground">
                Max 10MB • PDF format only
              </p>
            </>
          )}

          {ocrStatus === 'uploading' && (
            <>
              <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm font-medium">Uploading PDF...</p>
            </>
          )}

          {ocrStatus === 'processing' && (
            <>
              <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm font-medium">Extracting contract data...</p>
              <p className="text-xs text-muted-foreground mt-1">This may take 20-30 seconds</p>
            </>
          )}

          {ocrStatus === 'completed' && uploadedFile && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
              <p className="text-sm font-medium mb-2">Contract processed successfully</p>
              <div className="flex items-center justify-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{uploadedFile.name}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={(e) => {
                  e.stopPropagation();
                  setOcrStatus('idle');
                  setUploadedFile(null);
                  setPdfUrl(null);
                }}
              >
                Upload Different PDF
              </Button>
            </>
          )}

          {ocrStatus === 'error' && (
            <>
              <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
              <p className="text-sm font-medium text-destructive mb-2">Processing failed</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setOcrStatus('idle');
                  setUploadedFile(null);
                }}
              >
                Try Again
              </Button>
            </>
          )}
        </div>
      </div>

      {ocrStatus === 'completed' && (
        <div className="bg-muted/50 border rounded-md p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Auto-filled fields</p>
              <p className="text-xs text-muted-foreground mt-1">
                Form fields below have been populated from the contract. Please review and adjust if needed.
              </p>
              <Badge variant="secondary" className="mt-2 text-xs">
                Fields marked with ✓ were extracted from PDF
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}