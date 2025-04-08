
import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, AlertCircle, FileText, Loader2 } from "lucide-react";

const ContractUploader = () => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 5,
    maxSize: 10485760, // 10MB
  });

  const handleProcessFiles = () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one PDF file to process.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    // Simulating PDF processing
    setTimeout(() => {
      setIsProcessing(false);
      toast({
        title: "Contracts processed",
        description: `Successfully extracted data from ${files.length} contracts.`,
      });
      setFiles([]);
    }, 2000);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <FileText className="h-5 w-5 text-ammp-blue" />
          Contract Upload
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div 
          {...getRootProps()} 
          className={`upload-zone p-8 text-center ${isDragActive ? 'active' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-2">
            Drop PDF contracts here, or click to select files
          </p>
          <p className="text-xs text-muted-foreground">
            Supports: PDF up to 10MB
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Selected Files:</h4>
            <ul className="text-sm">
              {files.map((file, index) => (
                <li key={index} className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {file.name}
                </li>
              ))}
            </ul>
            <Button 
              onClick={handleProcessFiles} 
              className="mt-4 w-full"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process Contracts"
              )}
            </Button>
          </div>
        )}

        <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-3 w-3" />
          Contract data will be extracted automatically
        </div>
      </CardContent>
    </Card>
  );
};

export default ContractUploader;
