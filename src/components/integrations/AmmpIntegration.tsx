import { useState } from 'react';
import { CheckCircle2, Link2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAmmpConnection } from '@/hooks/useAmmpConnection';

const AmmpIntegration = () => {
  const [apiKey, setApiKey] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isConnected, isConnecting, connect, disconnect, testConnection, assets, error } = useAmmpConnection();

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      return;
    }

    try {
      await connect(apiKey.trim());
      setDialogOpen(false);
      setApiKey('');
    } catch {
      // Error is handled by the hook
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-ammp-blue" />
          <CardTitle>AMMP Data API</CardTitle>
        </div>
        <CardDescription>
          Connect to AMMP's asset and device monitoring data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected ? (
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect to AMMP API'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enter AMMP API Key</AlertDialogTitle>
                <AlertDialogDescription>
                  Your API key will be stored securely and used to authenticate with the AMMP Data API.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Enter your AMMP API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && apiKey.trim()) {
                      handleConnect();
                    }
                  }}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setApiKey('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConnect} disabled={!apiKey.trim()}>
                  Connect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <>
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Connected to AMMP Data API
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">Assets available:</span>{' '}
                <span className="text-muted-foreground">{assets?.length || 0}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={testConnection} variant="outline" size="sm">
                  Test Connection
                </Button>
                <Button onClick={disconnect} variant="outline" size="sm">
                  Disconnect
                </Button>
                <Button onClick={disconnect} variant="destructive" size="sm">
                  Clear Stored Key
                </Button>
              </div>
            </div>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default AmmpIntegration;
