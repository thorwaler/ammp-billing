import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RefreshCw, Clock, Calendar, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

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
}

const AmmpSyncSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasConnection, setHasConnection] = useState(false);
  const [settings, setSettings] = useState<SyncSettings>({
    sync_schedule: 'disabled',
    last_sync_at: null,
    next_sync_at: null,
  });

  useEffect(() => {
    fetchSettings();
  }, [user?.id]);

  const fetchSettings = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('ammp_connections')
        .select('sync_schedule, last_sync_at, next_sync_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasConnection(true);
        setSettings({
          sync_schedule: data.sync_schedule || 'disabled',
          last_sync_at: data.last_sync_at,
          next_sync_at: data.next_sync_at,
        });
      } else {
        setHasConnection(false);
      }
    } catch (error) {
      console.error('Error fetching sync settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSchedule = async (newSchedule: string) => {
    if (!user?.id) return;

    setSaving(true);
    try {
      // Calculate next sync date based on schedule
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
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => ({ 
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
        return new Date(year, month + 1, 1, 2, 0, 0, 0);

      case 'monthly_last':
        return new Date(year, month + 2, 0, 2, 0, 0, 0);

      case 'quarterly_last':
        const quarterEnds = [
          new Date(year, 2, 31, 2, 0, 0, 0),
          new Date(year, 5, 30, 2, 0, 0, 0),
          new Date(year, 8, 30, 2, 0, 0, 0),
          new Date(year, 11, 31, 2, 0, 0, 0),
        ];
        for (const qEnd of quarterEnds) {
          if (qEnd > now) return qEnd;
        }
        return new Date(year + 1, 2, 31, 2, 0, 0, 0);

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
        // Refresh settings to get updated last_sync_at
        await fetchSettings();
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Automatic AMMP Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasConnection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Automatic AMMP Sync
          </CardTitle>
          <CardDescription>
            Schedule automatic data synchronization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect to AMMP first to enable automatic sync scheduling.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-ammp-blue" />
          Automatic AMMP Sync
        </CardTitle>
        <CardDescription>
          Schedule automatic data synchronization before invoicing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sync Status */}
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last sync:</span>
            <span className="font-medium">
              {settings.last_sync_at 
                ? format(new Date(settings.last_sync_at), 'MMM d, yyyy h:mm a')
                : 'Never'
              }
            </span>
          </div>
          {settings.next_sync_at && settings.sync_schedule !== 'disabled' && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Next sync:</span>
              <span className="font-medium">
                {format(new Date(settings.next_sync_at), 'MMM d, yyyy h:mm a')}
              </span>
            </div>
          )}
        </div>

        {/* Schedule Options */}
        <div className="space-y-3">
          <Label>Sync Schedule</Label>
          <RadioGroup
            value={settings.sync_schedule}
            onValueChange={saveSchedule}
            disabled={saving}
            className="space-y-2"
          >
            {SCHEDULE_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-start space-x-3">
                <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
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
      </CardContent>
    </Card>
  );
};

export default AmmpSyncSettings;
