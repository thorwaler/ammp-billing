import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Webhook, ChevronDown, Loader2, Send, HelpCircle, CheckCircle2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const NOTIFICATION_TYPES = [
  { id: 'contract_expired', label: 'Contract Expired' },
  { id: 'contract_expiring_soon', label: 'Contract Expiring Soon' },
  { id: 'mw_warning', label: 'MW Capacity Warning' },
  { id: 'mw_exceeded', label: 'MW Capacity Exceeded' },
  { id: 'ammp_sync_complete', label: 'AMMP Sync Complete' },
  { id: 'ammp_sync_failed', label: 'AMMP Sync Failed' },
];

const SEVERITY_LEVELS = [
  { value: 'info', label: 'All (Info and above)' },
  { value: 'warning', label: 'Warnings and Errors only' },
  { value: 'error', label: 'Errors only' },
];

interface NotificationSettings {
  id?: string;
  zapier_webhook_url: string | null;
  webhook_enabled: boolean;
  notification_types: string[];
  min_severity: string;
}

const WebhookNotifications = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    zapier_webhook_url: '',
    webhook_enabled: false,
    notification_types: ['contract_expired', 'contract_expiring_soon', 'mw_warning', 'mw_exceeded'],
    min_severity: 'info',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Fetch any existing notification settings (shared across team)
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          zapier_webhook_url: data.zapier_webhook_url || '',
          webhook_enabled: data.webhook_enabled || false,
          notification_types: data.notification_types || ['contract_expired', 'contract_expiring_soon', 'mw_warning', 'mw_exceeded'],
          min_severity: data.min_severity || 'info',
        });
      }
    } catch (error) {
      console.error('Error fetching notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const payload = {
        user_id: user.id, // Track who configured it (audit trail)
        zapier_webhook_url: settings.zapier_webhook_url || null,
        webhook_enabled: settings.webhook_enabled,
        notification_types: settings.notification_types,
        min_severity: settings.min_severity,
      };

      if (settings.id) {
        // Update existing shared settings
        const { error } = await supabase
          .from('notification_settings')
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        // Create new shared settings
        const { data, error } = await supabase
          .from('notification_settings')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      toast.success('Webhook settings saved');
    } catch (error: any) {
      console.error('Error saving notification settings:', error);
      toast.error('Failed to save settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!settings.zapier_webhook_url) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('push-notification-webhook', {
        body: {
          notification_id: 'test-' + Date.now(),
          user_id: user?.id,
          type: 'test',
          title: '🧪 Test Notification',
          message: 'This is a test notification from AMMP Revenue & Invoicing. If you receive this, the webhook is working correctly!',
          severity: 'info',
          metadata: { test: true },
          contract_id: null,
          created_at: new Date().toISOString(),
          is_test: true,
        },
      });

      if (error) throw error;
      toast.success('Test notification sent! Check your webhook endpoint.');
    } catch (error: any) {
      console.error('Error testing webhook:', error);
      toast.error('Failed to send test: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  const toggleNotificationType = (typeId: string) => {
    setSettings(prev => ({
      ...prev,
      notification_types: prev.notification_types.includes(typeId)
        ? prev.notification_types.filter(t => t !== typeId)
        : [...prev.notification_types, typeId],
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-ammp-blue" />
          Webhook Notifications
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <Users className="h-3 w-3" />
          <span>Team integration • Shared across all users</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="webhook-enabled">Enable Webhook</Label>
            <p className="text-sm text-muted-foreground">
              Send notifications to an external webhook endpoint
            </p>
          </div>
          <Switch
            id="webhook-enabled"
            checked={settings.webhook_enabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, webhook_enabled: checked }))}
          />
        </div>

        {/* Webhook URL */}
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Webhook URL</Label>
          <div className="flex gap-2">
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://your-webhook-endpoint.com/..."
              value={settings.zapier_webhook_url || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, zapier_webhook_url: e.target.value }))}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={testWebhook}
              disabled={testing || !settings.zapier_webhook_url}
              title="Send test notification"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Notification Types */}
        <div className="space-y-3">
          <Label>Notification Types</Label>
          <div className="grid grid-cols-2 gap-3">
            {NOTIFICATION_TYPES.map((type) => (
              <div key={type.id} className="flex items-center space-x-2">
                <Checkbox
                  id={type.id}
                  checked={settings.notification_types.includes(type.id)}
                  onCheckedChange={() => toggleNotificationType(type.id)}
                />
                <label
                  htmlFor={type.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {type.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Minimum Severity */}
        <div className="space-y-2">
          <Label htmlFor="min-severity">Minimum Severity</Label>
          <Select
            value={settings.min_severity}
            onValueChange={(value) => setSettings(prev => ({ ...prev, min_severity: value }))}
          >
            <SelectTrigger id="min-severity">
              <SelectValue placeholder="Select minimum severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Save Button */}
        <Button onClick={saveSettings} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>

        {/* Help Section */}
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                How to use webhooks
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="rounded-lg bg-muted p-4 text-sm space-y-3">
              <p className="font-medium">Setup Instructions:</p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Set up a webhook receiver in your preferred service (Slack, Teams, Make, n8n, custom endpoint, etc.)</li>
                <li>Copy the webhook URL and paste it above</li>
                <li>Click the <strong>Send</strong> button to test the connection</li>
                <li>Select which notification types you want to receive</li>
                <li>Save your settings</li>
              </ol>
              <p className="font-medium mt-4">Payload Format:</p>
              <p className="text-muted-foreground">
                The webhook receives JSON with: type, title, message, severity, metadata, timestamp
              </p>
              <p className="font-medium mt-4">Compatible Services:</p>
              <p className="text-muted-foreground">
                Slack, Microsoft Teams, Discord, Make (Integromat), n8n, custom APIs, and any service that accepts HTTP webhooks
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default WebhookNotifications;