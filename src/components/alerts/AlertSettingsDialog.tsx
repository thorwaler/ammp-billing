import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, RotateCcw } from "lucide-react";
import { useAlertSettings, DEFAULT_SETTINGS, AlertSettings } from "@/hooks/useAlertSettings";
import { toast } from "@/hooks/use-toast";

interface AlertSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AlertSettingsDialog({ open, onOpenChange }: AlertSettingsDialogProps) {
  const { settings, loading, saving, updateSettings, resetToDefaults } = useAlertSettings();
  const [localSettings, setLocalSettings] = useState<AlertSettings>(settings);

  useEffect(() => {
    if (open) {
      setLocalSettings(settings);
    }
  }, [open, settings]);

  const handleSave = async () => {
    const success = await updateSettings(localSettings);
    if (success) {
      toast({
        title: "Settings saved",
        description: "Alert thresholds have been updated.",
      });
      onOpenChange(false);
    } else {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    const success = await resetToDefaults();
    if (success) {
      setLocalSettings(DEFAULT_SETTINGS);
      toast({
        title: "Settings reset",
        description: "Alert thresholds have been reset to defaults.",
      });
    }
  };

  const updateLocal = (key: keyof AlertSettings, value: number | boolean) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alert Thresholds</DialogTitle>
          <DialogDescription>
            Configure when alerts are triggered for invoice anomalies.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Invoice Amount Alerts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Invoice Amount Alerts</Label>
                <Switch
                  checked={localSettings.invoice_increase_enabled}
                  onCheckedChange={(checked) => updateLocal('invoice_increase_enabled', checked)}
                />
              </div>
              <div className="space-y-3 pl-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="warning-threshold" className="text-sm text-muted-foreground">
                      Warning threshold
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="warning-threshold"
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(localSettings.invoice_increase_warning * 100)}
                        onChange={(e) => updateLocal('invoice_increase_warning', Number(e.target.value) / 100)}
                        disabled={!localSettings.invoice_increase_enabled}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="critical-threshold" className="text-sm text-muted-foreground">
                      Critical threshold
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="critical-threshold"
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(localSettings.invoice_increase_critical * 100)}
                        onChange={(e) => updateLocal('invoice_increase_critical', Number(e.target.value) / 100)}
                        disabled={!localSettings.invoice_increase_enabled}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Triggers when invoice amount exceeds the average of the last 4 invoices by this percentage.
                </p>
              </div>
            </div>

            <Separator />

            {/* MW Decrease Alerts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">MW Decrease Alerts</Label>
                <Switch
                  checked={localSettings.mw_decrease_enabled}
                  onCheckedChange={(checked) => updateLocal('mw_decrease_enabled', checked)}
                />
              </div>
              <div className="space-y-3 pl-4">
                <div className="space-y-2">
                  <Label htmlFor="mw-threshold" className="text-sm text-muted-foreground">
                    Minimum decrease to trigger
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="mw-threshold"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(localSettings.mw_decrease_threshold * 100)}
                      onChange={(e) => updateLocal('mw_decrease_threshold', Number(e.target.value) / 100)}
                      disabled={!localSettings.mw_decrease_enabled}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set to 0 to trigger on any MW decrease.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Site Count Alerts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Site Count Alerts</Label>
                <Switch
                  checked={localSettings.site_decrease_enabled}
                  onCheckedChange={(checked) => updateLocal('site_decrease_enabled', checked)}
                />
              </div>
              <div className="space-y-3 pl-4">
                <div className="space-y-2">
                  <Label htmlFor="site-threshold" className="text-sm text-muted-foreground">
                    Minimum sites decrease to trigger
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="site-threshold"
                      type="number"
                      min={0}
                      step={1}
                      value={localSettings.site_decrease_threshold}
                      onChange={(e) => updateLocal('site_decrease_threshold', Number(e.target.value))}
                      disabled={!localSettings.site_decrease_enabled}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">sites</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set to 0 to trigger on any site count decrease.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Asset Manipulation Detection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Asset Manipulation Detection</Label>
                <Switch
                  checked={localSettings.asset_manipulation_enabled}
                  onCheckedChange={(checked) => updateLocal('asset_manipulation_enabled', checked)}
                />
              </div>
              <div className="space-y-3 pl-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manipulation-window" className="text-sm text-muted-foreground">
                      Detection window
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="manipulation-window"
                        type="number"
                        min={7}
                        max={90}
                        step={1}
                        value={localSettings.asset_manipulation_window_days}
                        onChange={(e) => updateLocal('asset_manipulation_window_days', Number(e.target.value))}
                        disabled={!localSettings.asset_manipulation_enabled}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manipulation-threshold" className="text-sm text-muted-foreground">
                      MW change threshold
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="manipulation-threshold"
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={Math.round(localSettings.asset_manipulation_threshold * 100)}
                        onChange={(e) => updateLocal('asset_manipulation_threshold', Number(e.target.value) / 100)}
                        disabled={!localSettings.asset_manipulation_enabled}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Flags when MW changes suspiciously around invoice dates within the detection window.
                </p>
              </div>
            </div>

            <Separator />

            {/* Individual Asset Tracking */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Individual Asset Tracking</Label>
                <Switch
                  checked={localSettings.individual_asset_tracking_enabled}
                  onCheckedChange={(checked) => updateLocal('individual_asset_tracking_enabled', checked)}
                />
              </div>
              <div className="space-y-3 pl-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="suspicious-days" className="text-sm text-muted-foreground">
                      Suspicious reappear threshold
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="suspicious-days"
                        type="number"
                        min={1}
                        max={90}
                        step={1}
                        value={localSettings.asset_reappear_suspicious_days}
                        onChange={(e) => updateLocal('asset_reappear_suspicious_days', Number(e.target.value))}
                        disabled={!localSettings.individual_asset_tracking_enabled}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min-mw-alert" className="text-sm text-muted-foreground">
                      Minimum asset MW
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="min-mw-alert"
                        type="number"
                        min={0}
                        max={10}
                        step={0.01}
                        value={localSettings.minimum_asset_mw_for_alert}
                        onChange={(e) => updateLocal('minimum_asset_mw_for_alert', Number(e.target.value))}
                        disabled={!localSettings.individual_asset_tracking_enabled}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">MW</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Track individual asset appearances/disappearances. Alerts generated when assets reappear within the suspicious threshold after being absent.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving || loading}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
