import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface AmendmentUploaderProps {
  contractId: string;
  nextAmendmentNumber: number;
  onUploadComplete: () => void;
}

export default function AmendmentUploader({
  contractId,
  nextAmendmentNumber,
  onUploadComplete,
}: AmendmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const { toast } = useToast();

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadStatus("idle");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user");

      // Create amendment record first
      const { data: amendment, error: amendmentError } = await supabase
        .from("contract_amendments")
        .insert({
          contract_id: contractId,
          amendment_number: nextAmendmentNumber,
          amendment_date: new Date().toISOString(),
          effective_date: effectiveDate || null,
          pdf_url: "", // Will be updated after upload
          ocr_status: "pending",
          user_id: user.id,
        })
        .select()
        .single();

      if (amendmentError) throw amendmentError;

      // Upload PDF to storage
      const fileName = `${user.id}/contracts/${contractId}/amendments/${amendment.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contract-pdfs")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("contract-pdfs")
        .getPublicUrl(fileName);

      // Update amendment with PDF URL
      const { error: updateError } = await supabase
        .from("contract_amendments")
        .update({ pdf_url: publicUrl })
        .eq("id", amendment.id);

      if (updateError) throw updateError;

      setUploading(false);
      setProcessing(true);

      // Trigger OCR processing
      const { error: functionError } = await supabase.functions.invoke(
        "process-contract-ocr",
        {
          body: {
            pdfUrl: publicUrl,
            contractId: contractId,
            isAmendment: true,
            amendmentId: amendment.id,
          },
        }
      );

      if (functionError) throw functionError;

      setProcessing(false);
      setUploadStatus("success");
      toast({
        title: "Amendment uploaded",
        description: `Amendment #${nextAmendmentNumber} has been uploaded and is being processed.`,
      });
      
      setTimeout(() => {
        onUploadComplete();
      }, 1500);
    } catch (error: any) {
      console.error("Error uploading amendment:", error);
      setUploading(false);
      setProcessing(false);
      setUploadStatus("error");
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload amendment",
        variant: "destructive",
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: uploading || processing,
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="effective-date">Effective Date (Optional)</Label>
            <Input
              id="effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              disabled={uploading || processing}
            />
          </div>

          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${isDragActive ? "border-primary bg-primary/5" : "border-border"}
              ${uploading || processing ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-accent/50"}
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              {uploadStatus === "idle" && !uploading && !processing && (
                <>
                  {isDragActive ? (
                    <Upload className="h-12 w-12 text-primary" />
                  ) : (
                    <FileText className="h-12 w-12 text-muted-foreground" />
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {isDragActive
                        ? "Drop the PDF here"
                        : "Drag & drop PDF or click to browse"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Amendment #{nextAmendmentNumber}
                    </p>
                  </div>
                </>
              )}

              {uploading && (
                <>
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="text-sm font-medium">Uploading...</p>
                </>
              )}

              {processing && (
                <>
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="text-sm font-medium">Processing with OCR...</p>
                </>
              )}

              {uploadStatus === "success" && (
                <>
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="text-sm font-medium text-green-600">
                    Amendment uploaded successfully!
                  </p>
                </>
              )}

              {uploadStatus === "error" && (
                <>
                  <XCircle className="h-12 w-12 text-destructive" />
                  <p className="text-sm font-medium text-destructive">
                    Upload failed. Please try again.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
