import { useState, useEffect } from 'react';
import { CheckCircle2, Link2, AlertCircle, Clock, Calendar, RefreshCw, Loader2, Users } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useAmmpConnection } from '@/hooks/useAmmpConnection';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SCHEDULE_OPTIONS = [
  { value: 'disabled', label: 'Disabled', description: 'No automatic sync' },
  { value: 'daily', label: 'Daily', description: '2:00 AM UTC every day' },
  { value: 'weekly', label: 'Weekly', description: 'Sundays at 2:00 AM UTC' },
  { value: 'monthly_first', label: 'Monthly - First day', description: '1st of each month at 2:00 AM UTC' },
  { value: 'monthly_last', label: 'Monthly - Last day', description: 'Last day of each month at 2:00 AM UTC' },
  { value: 'quarterly_last', label: 'Quarterly - Last day', description: 'Mar 31, Jun 30, Sep 30, Dec 31 at 2:00 AM UTC' },
];

interface SyncSettings {
  sync_schedule: string;
  last_sync_at: string | null;
  next_sync_at: string | null;
  connection_id: string | null;
  connected_at: string | null;
}

const AmmpIntegration = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { isConnected, isConnecting, connect, disconnect, testConnection, assets, error } = useAmmpConnection();

  // Sync settings state
  const [syncLoading, setSyncLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    sync_schedule: 'disabled',
    last_sync_at: null,
    next_sync_at: null,
    connection_id: null,
    connected_at: null,
  });

  useEffect(() => {
    if (isConnected && user?.id) {
      fetchSyncSettings();
    } else {
      setSyncLoading(false);
    }
  }, [isConnected, user?.id]);

  const fetchSyncSettings = async () => {
    if (!user?.id) return;

    try {
      // Fetch ANY existing AMMP connection (shared across team)
      const { data, error } = await supabase
        .from('ammp_connections')
        .select('id, sync_schedule, last_sync_at, next_sync_at, created_at')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSyncSettings({
          sync_schedule: data.sync_schedule || 'disabled',
          last_sync_at: data.last_sync_at,
          next_sync_at: data.next_sync_at,
          connection_id: data.id,
          connected_at: data.created_at,
        });
      }
    } catch (error) {
      console.error('Error fetching sync settings:', error);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      return;
    }

    try {
      await connect(apiKey.trim());
      setDialogOpen(false);
      setApiKey('');
      // Refresh sync settings after connecting
      await fetchSyncSettings();
    } catch {
      // Error is handled by the hook
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setSyncSettings({
      sync_schedule: 'disabled',
      last_sync_at: null,
      next_sync_at: null,
      connection_id: null,
      connected_at: null,
    });
  };

  const saveSchedule = async (newSchedule: string) => {
    if (!syncSettings.connection_id) return;

    setSaving(true);
    try {
      let nextSyncAt: string | null = null;
      if (newSchedule !== 'disabled') {
        const next = calculateNextSync(newSchedule);
        nextSyncAt = next?.toISOString() || null;
      }

      const { error } = await supabase
        .from('ammp_connections')
        .update({ 
          sync_schedule: newSchedule,
          next_sync_at: nextSyncAt,
        })
        .eq('id', syncSettings.connection_id);

      if (error) throw error;

      setSyncSettings(prev => ({ 
        ...prev, 
        sync_schedule: newSchedule,
        next_sync_at: nextSyncAt,
      }));
      toast.success('Sync schedule updated');
    } catch (error: any) {
      console.error('Error saving sync schedule:', error);
      toast.error('Failed to update schedule: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const calculateNextSync = (schedule: string): Date | null => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    switch (schedule) {
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(2, 0, 0, 0);
        return tomorrow;

      case 'weekly':
        const nextSunday = new Date(now);
        nextSunday.setUTCDate(nextSunday.getUTCDate() + (7 - nextSunday.getUTCDay()));
        nextSunday.setUTCHours(2, 0, 0, 0);
        return nextSunday;

      case 'monthly_first':
        const firstDayThisMonth = new Date(Date.UTC(year, month, 1, 2, 0, 0, 0));
        if (now < firstDayThisMonth) {
          return firstDayThisMonth;
        }
        return new Date(Date.UTC(year, month + 1, 1, 2, 0, 0, 0));

      case 'monthly_last':
        const lastDayThisMonth = new Date(Date.UTC(year, month + 1, 0, 2, 0, 0, 0));
        if (now < lastDayThisMonth) {
          return lastDayThisMonth;
        }
        return new Date(Date.UTC(year, month + 2, 0, 2, 0, 0, 0));

      case 'quarterly_last':
        const quarterEnds = [
          new Date(Date.UTC(year, 2, 31, 2, 0, 0, 0)),
          new Date(Date.UTC(year, 5, 30, 2, 0, 0, 0)),
          new Date(Date.UTC(year, 8, 30, 2, 0, 0, 0)),
          new Date(Date.UTC(year, 11, 31, 2, 0, 0, 0)),
        ];
        for (const qEnd of quarterEnds) {
          if (qEnd > now) return qEnd;
        }
        return new Date(Date.UTC(year + 1, 2, 31, 2, 0, 0, 0));

      default:
        return null;
    }
  };

  const triggerManualSync = async () => {
    if (!user?.id) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ammp-scheduled-sync', {
        body: { manual: true, user_id: user.id },
      });

      if (error) throw error;

      const result = data?.results?.[0];
      if (result?.success) {
        toast.success(`Sync complete! ${result.customersProcessed} customer(s) synced.`);
        await fetchSyncSettings();
      } else {
        toast.error('Sync failed: ' + (result?.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error triggering manual sync:', error);
      toast.error('Failed to trigger sync: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-ammp-blue" />
          <CardTitle>AMMP Integration</CardTitle>
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
                  Your API key will be stored securely on the server and shared across all team members.
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

            {/* Shared integration indicator */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <Users className="h-4 w-4" />
              <span>
                Team integration
                {syncSettings.connected_at && (
                  <> · Connected {format(new Date(syncSettings.connected_at), 'MMM d, yyyy')}</>
                )}
              </span>
            </div>

            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">Assets available:</span>{' '}
                <span className="text-muted-foreground">{assets?.length || 0}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={testConnection} variant="outline" size="sm">
                  Test Connection
                </Button>
                <Button onClick={handleDisconnect} variant="outline" size="sm">
                  Disconnect
                </Button>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Sync Settings Section */}
            {syncLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-ammp-blue" />
                  <span className="font-medium text-sm">Automatic Sync</span>
                </div>

                {/* Sync Status */}
                <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Last sync:</span>
                    <span className="font-medium">
                      {syncSettings.last_sync_at 
                        ? format(new Date(syncSettings.last_sync_at), 'MMM d, yyyy h:mm a')
                        : 'Never'
                      }
                    </span>
                  </div>
                  {syncSettings.next_sync_at && syncSettings.sync_schedule !== 'disabled' && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Next sync:</span>
                      <span className="font-medium">
                        {format(new Date(syncSettings.next_sync_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Schedule Options */}
                <div className="space-y-2">
                  <Label className="text-sm">Sync Schedule</Label>
                  <RadioGroup
                    value={syncSettings.sync_schedule}
                    onValueChange={saveSchedule}
                    disabled={saving}
                    className="space-y-1"
                  >
                    {SCHEDULE_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-start space-x-3">
                        <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                        <label htmlFor={option.value} className="flex flex-col cursor-pointer">
                          <span className="text-sm font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Manual Sync Button */}
                <Button
                  onClick={triggerManualSync}
                  disabled={syncing}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            )}
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