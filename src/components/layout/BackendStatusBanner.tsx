import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackendStatusBanner() {
  const { authError } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!authError || dismissed) {
    return null;
  }

  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>{authError}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
