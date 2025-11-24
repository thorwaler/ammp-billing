import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, authError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user && !authError) {
      navigate("/auth");
    }
  }, [user, loading, authError, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user && authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backend Unavailable</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>
              We can't verify your login because the backend is unreachable. Please try again later or refresh the page.
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>
              <Button 
                variant="outline" 
                onClick={() => navigate("/auth")}
              >
                Go to Login
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
