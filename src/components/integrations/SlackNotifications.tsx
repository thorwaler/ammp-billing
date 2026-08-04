import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Slack, Loader2, Send, CheckCircle2, AlertCircle, RefreshCw, Users, Plus, X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";


interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

interface SlackRoute {
  id?: string;
  notification_type: string;
  channel_id: string;
  channel_name?: string;
  enabled: boolean;
}

interface NotificationTypeOption {
  id: string;
  label: string;
  group: string;
}

const NOTIFICATION_TYPES: NotificationTypeOption[] = [
  // Contract alerts
  { id: 'contract_expired', label: 'Contract Expired', group: 'Contract' },
  { id: 'contract_expiring_soon', label: 'Contract Expiring Soon', group: 'Contract' },
  // MW alerts
  { id: 'mw_warning', label: 'MW Capacity Warning', group: 'MW' },
  { id: 'mw_exceeded', label: 'MW Capacity Exceeded', group: 'MW' },
  // Sync alerts
  { id: 'ammp_sync_complete', label: 'AMMP Sync Complete', group: 'Sync' },
  { id: 'ammp_sync_failed', label: 'AMMP Sync Failed', group: 'Sync' },
  { id: 'ammp_contract_synced', label: 'AMMP Contract Synced (per-contract)', group: 'Sync' },
  { id: 'xero_sync_complete', label: 'Xero Sync Complete', group: 'Sync' },
  { id: 'xero_sync_failed', label: 'Xero Sync Failed', group: 'Sync' },
  // Invoice alerts
  { id: 'invoice_increase', label: 'Invoice Amount Increase', group: 'Invoice' },
  { id: 'mw_decrease', label: 'MW Decrease Alert', group: 'Invoice' },
  { id: 'site_decrease', label: 'Site Count Decrease', group: 'Invoice' },
  { id: 'asset_disappeared', label: 'Asset Disappeared (Manipulation)', group: 'Invoice' },
  { id: 'asset_reappeared', label: 'Asset Reappeared (Manipulation)', group: 'Invoice' },
  { id: 'invoice_due_soon', label: 'Invoice Due Soon (heads-up)', group: 'Invoice' },
  { id: 'invoice_due_today', label: 'Invoice Due Today', group: 'Invoice' },
  { id: 'invoice_overdue', label: 'Invoice Overdue', group: 'Invoice' },
  // Elum & alert-page alerts
  { id: 'elum_org_unassigned', label: 'Elum Sub-org Without Tier', group: 'Elum & Alerts' },
  { id: 'elum_asset_double_count', label: 'Elum Asset Double Count', group: 'Elum & Alerts' },
  { id: 'elum_utility_site_too_small', label: 'Elum Utility Site < 2 MWp', group: 'Elum & Alerts' },
  { id: 'elum_combined_minimum_shortfall', label: 'Elum Combined Minimum Shortfall', group: 'Elum & Alerts' },
  { id: 'zero_pv_capacity', label: 'Zero PV Capacity', group: 'Elum & Alerts' },
  { id: 'asset_reappeared_suspicious', label: 'Suspicious Asset Return', group: 'Elum & Alerts' },
  { id: 'ammp_site_count_drop', label: 'AMMP Site Count Drop', group: 'Elum & Alerts' },
];

const SlackNotifications = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [routes, setRoutes] = useState<Record<string, SlackRoute[]>>({});
  const [initialRouteIds, setInitialRouteIds] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [typeSearch, setTypeSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchChannels(), fetchRoutes()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    setChannelsLoading(true);
    setConnectionError(null);
    try {
      const { data, error } = await supabase.functions.invoke('slack-list-channels', {});
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setChannels(data.channels || []);
    } catch (error: any) {
      console.error('Error fetching Slack channels:', error);
      const message = error.message || 'Failed to load channels';
      setConnectionError(message);
      if (message.includes('missing_scope') || message.includes('token_revoked') || message.includes('invalid_auth')) {
        toast.error('Slack connection needs reconnecting. Please reconnect in workspace connector settings.');
      }
    } finally {
      setChannelsLoading(false);
    }
  };

  const fetchRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from('slack_notification_routes')
        .select('*');
      if (error) throw error;

      const routeMap: Record<string, SlackRoute[]> = {};
      for (const route of data || []) {
        if (!routeMap[route.notification_type]) routeMap[route.notification_type] = [];
        routeMap[route.notification_type].push(route);
      }
      setRoutes(routeMap);
      setInitialRouteIds((data || []).map((r: any) => r.id));
    } catch (error: any) {
      console.error('Error fetching Slack routes:', error);
      toast.error('Failed to load Slack routes: ' + error.message);
    }
  };

  const addChannel = (typeId: string, channelId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    setRoutes((prev) => {
      const current = prev[typeId] || [];
      if (current.some((r) => r.channel_id === channelId)) return prev;
      return {
        ...prev,
        [typeId]: [
          ...current,
          {
            notification_type: typeId,
            channel_id: channelId,
            channel_name: channel?.name,
            enabled: true,
          },
        ],
      };
    });
    setOpenPicker(null);
  };

  const removeChannel = (typeId: string, channelId: string) => {
    setRoutes((prev) => ({
      ...prev,
      [typeId]: (prev[typeId] || []).filter((r) => r.channel_id !== channelId),
    }));
  };

  const toggleChannel = (typeId: string, channelId: string, enabled: boolean) => {
    setRoutes((prev) => ({
      ...prev,
      [typeId]: (prev[typeId] || []).map((r) =>
        r.channel_id === channelId ? { ...r, enabled } : r
      ),
    }));
  };

  const saveRoutes = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const keptIds = new Set(
        Object.values(routes).flat().map((r) => r.id).filter(Boolean) as string[]
      );
      const toDelete = initialRouteIds.filter((id) => !keptIds.has(id));

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('slack_notification_routes')
          .delete()
          .in('id', toDelete);
        if (error) throw error;
      }

      for (const [typeId, list] of Object.entries(routes)) {
        for (const route of list) {
          const payload = {
            notification_type: typeId,
            channel_id: route.channel_id,
            channel_name:
              route.channel_name || channels.find((c) => c.id === route.channel_id)?.name || '',
            enabled: route.enabled,
          };

          if (route.id) {
            const { error } = await supabase
              .from('slack_notification_routes')
              .update(payload)
              .eq('id', route.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('slack_notification_routes').insert(payload);
            if (error) throw error;
          }
        }
      }

      await fetchRoutes();
      toast.success('Slack routes saved');
    } catch (error: any) {
      console.error('Error saving Slack routes:', error);
      toast.error('Failed to save routes: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const testRoute = async (type: NotificationTypeOption, channelId?: string) => {
    const list = routes[type.id] || [];
    if (list.length === 0) {
      toast.error('Add a Slack channel first');
      return;
    }

    const key = channelId ? `${type.id}:${channelId}` : type.id;
    setTesting((prev) => ({ ...prev, [key]: true }));
    try {
      const { error } = await supabase.functions.invoke('slack-post-alert', {
        body: {
          alert_type: type.id,
          severity: 'warning',
          title: `🧪 Test: ${type.label}`,
          description: `This is a test Slack alert for *${type.label}*. If you see this message, the route is configured correctly.`,
          metadata: { test: true, notification_type: type.id },
          contract_id: null,
          customer_id: null,
          channel_id: channelId || null,
          is_test: true,
        },
      });

      if (error) throw error;
      toast.success(`Test message sent to Slack for ${type.label}`);
    } catch (error: any) {
      console.error('Error testing Slack route:', error);
      toast.error('Failed to send test: ' + error.message);
    } finally {
      setTesting((prev) => ({ ...prev, [key]: false }));
    }
  };

  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return NOTIFICATION_TYPES;
    return NOTIFICATION_TYPES.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        (routes[t.id] || []).some((r) => (r.channel_name || '').toLowerCase().includes(q))
    );
  }, [typeSearch, routes]);

  const groupedTypes = filteredTypes.reduce((acc, type) => {
    if (!acc[type.group]) acc[type.group] = [];
    acc[type.group].push(type);
    return acc;
  }, {} as Record<string, NotificationTypeOption[]>);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Slack className="h-5 w-5" />
            Slack Notifications
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
          <Slack className="h-5 w-5 text-ammp-blue" />
          Slack Notifications
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <Users className="h-3 w-3" />
          <span>Team integration • Route each alert to one or more Slack channels</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {connectionError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-destructive">Could not load Slack channels</p>
              <p className="text-sm text-muted-foreground">{connectionError}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Slack connection</Label>
            <p className="text-sm text-muted-foreground">
              {channels.length > 0
                ? `${channels.length} public channel(s) available`
                : connectionError
                ? 'Connection error'
                : 'No channels found'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchChannels}
            disabled={channelsLoading}
          >
            {channelsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>

        {channels.length === 0 && !connectionError && !channelsLoading && (
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            No public Slack channels were found. Make sure the bot is invited to at least one public channel.
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={typeSearch}
            onChange={(e) => setTypeSearch(e.target.value)}
            placeholder="Search alert types or channels..."
            className="pl-9"
          />
        </div>

        <div className="space-y-6">
          {Object.keys(groupedTypes).length === 0 && (
            <p className="text-sm text-muted-foreground">No alert types match "{typeSearch}".</p>
          )}
          {Object.entries(groupedTypes).map(([group, types]) => (
            <div key={group} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </h3>
              <div className="space-y-3">
                {types.map((type) => {
                  const list = routes[type.id] || [];
                  const available = channels.filter(
                    (c) => !list.some((r) => r.channel_id === c.id)
                  );

                  return (
                    <div
                      key={type.id}
                      className="flex flex-col gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Label className="text-sm font-medium">{type.label}</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">{type.id}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Popover
                            open={openPicker === type.id}
                            onOpenChange={(open) => setOpenPicker(open ? type.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={available.length === 0}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add channel
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-0" align="end">
                              <Command>
                                <CommandInput placeholder="Search channels..." />
                                <CommandList>
                                  <CommandEmpty>No channel found.</CommandEmpty>
                                  <CommandGroup>
                                    {available.map((channel) => (
                                      <CommandItem
                                        key={channel.id}
                                        value={channel.name}
                                        onSelect={() => addChannel(type.id, channel.id)}
                                      >
                                        #{channel.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => testRoute(type)}
                            disabled={testing[type.id] || list.length === 0}
                            title="Send test message to all enabled channels"
                          >
                            {testing[type.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {list.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Not routed to Slack.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {list.map((route) => {
                            const testKey = `${type.id}:${route.channel_id}`;
                            const name =
                              route.channel_name ||
                              channels.find((c) => c.id === route.channel_id)?.name ||
                              route.channel_id;
                            return (
                              <div
                                key={route.channel_id}
                                className="flex items-center gap-2 rounded-full border bg-muted/40 pl-3 pr-1 py-1"
                              >
                                <span className="text-xs font-medium">#{name}</span>
                                <Switch
                                  checked={route.enabled}
                                  onCheckedChange={(checked) =>
                                    toggleChannel(type.id, route.channel_id, checked)
                                  }
                                  aria-label={`Enable ${name} for ${type.label}`}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => testRoute(type, route.channel_id)}
                                  disabled={testing[testKey]}
                                  title={`Send test to #${name}`}
                                >
                                  {testing[testKey] ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => removeChannel(type.id, route.channel_id)}
                                  title={`Remove #${name}`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={saveRoutes} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Routes
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SlackNotifications;

