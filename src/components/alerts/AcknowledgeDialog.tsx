import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface AcknowledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertTitle: string;
  onConfirm: (note: string) => void;
  isLoading?: boolean;
}

export function AcknowledgeDialog({
  open,
  onOpenChange,
  alertTitle,
  onConfirm,
  isLoading,
}: AcknowledgeDialogProps) {
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    onConfirm(note);
    setNote("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setNote("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acknowledge Alert</DialogTitle>
          <DialogDescription>
            You are acknowledging the alert: <strong>{alertTitle}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              placeholder="Add a note about why this alert was acknowledged..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Acknowledging..." : "Acknowledge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
