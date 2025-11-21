import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import AmendmentForm from "./AmendmentForm";
import AmendmentTimeline from "./AmendmentTimeline";
import { useToast } from "@/hooks/use-toast";

interface ContractAmendmentsProps {
  contractId: string;
  originalContract: {
    signed_date: string | null;
    contract_pdf_url: string | null;
  };
}

export default function ContractAmendments({
  contractId,
  originalContract,
}: ContractAmendmentsProps) {
  const [amendments, setAmendments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const { toast } = useToast();

  const loadAmendments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contract_amendments")
        .select("*")
        .eq("contract_id", contractId)
        .order("amendment_number", { ascending: false });

      if (error) throw error;
      setAmendments(data || []);
    } catch (error: any) {
      console.error("Error loading amendments:", error);
      toast({
        title: "Failed to load amendments",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAmendments();
  }, [contractId]);

  const nextAmendmentNumber =
    amendments.length > 0
      ? Math.max(...amendments.map((a) => a.amendment_number)) + 1
      : 1;

  const handleUploadComplete = () => {
    setUploaderOpen(false);
    loadAmendments();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Contract Amendments</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {amendments.length} amendment{amendments.length !== 1 ? "s" : ""}{" "}
              recorded
            </p>
          </div>
          <Dialog open={uploaderOpen} onOpenChange={setUploaderOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Amendment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Contract Amendment</DialogTitle>
                <DialogDescription>
                  Record changes made to this contract. Any pricing or term changes
                  will automatically update the contract data.
                </DialogDescription>
              </DialogHeader>
              <AmendmentForm
                contractId={contractId}
                nextAmendmentNumber={nextAmendmentNumber}
                onComplete={handleUploadComplete}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <AmendmentTimeline
            amendments={amendments}
            originalContract={originalContract}
          />
        )}
      </CardContent>
    </Card>
  );
}
