import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, AlertCircle, Copy, Zap, Battery, Activity, Database, ChevronDown, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncCustomerAMMPData, calculateCapabilities } from "@/services/ammp/ammpService";
import { dataApiClient } from "@/services/ammp/dataApiClient";
import { DeviceResponse, SyncAnomalies } from "@/types/ammp-api";
interface CustomerFormProps {
  onComplete: () => void;
  existingCustomer?: any;
}

const CustomerForm = ({ onComplete, existingCustomer }: CustomerFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedAssets, setSyncedAssets] = useState<any[]>([]);
  const [syncedCapabilities, setSyncedCapabilities] = useState<any>(null);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    assetName: string;
  } | null>(null);
  const [syncAnomalies, setSyncAnomalies] = useState<SyncAnomalies | null>(null);
  const [assetsWithDevices, setAssetsWithDevices] = useState<Map<string, {
    devices: DeviceResponse[];
    loading: boolean;
    error: string | null;
  }>>(new Map());
  const [formData, setFormData] = useState({
    name: existingCustomer?.name || "",
    location: existingCustomer?.location || "",
    mwpManaged: existingCustomer?.mwpManaged || "",
    status: existingCustomer?.status || "active",
    ammpOrgId: existingCustomer?.ammp_org_id || "",
  });
  
  // Track original status to detect manual changes
  const [originalStatus] = useState(existingCustomer?.status || "active");

  // Initialize synced assets from existing customer
  useEffect(() => {
    if (existingCustomer?.ammp_asset_ids) {
      setSyncedAssets(existingCustomer.ammp_asset_ids);
    }
    if (existingCustomer?.ammp_capabilities) {
      setSyncedCapabilities(existingCustomer.ammp_capabilities);
    }
  }, [existingCustomer]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSyncFromAMMP = async () => {
    if (!formData.ammpOrgId) {
      toast({
        title: "Missing Org ID",
        description: "Please enter an AMMP Org ID first",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    setSyncProgress(null);
    try {
      // For existing customers, sync to database
      if (existingCustomer?.id) {
        const result = await syncCustomerAMMPData(
          existingCustomer.id, 
          formData.ammpOrgId,
          (current, total, assetName) => {
            setSyncProgress({ current, total, assetName });
          }
        );
        
        // Update states with synced data
        setSyncedCapabilities(result.summary);
        setSyncAnomalies(result.anomalies);
        setSyncedAssets(result.summary.assetBreakdown.map((a: any) => a.assetId));
        setFormData(prev => ({
          ...prev,
          mwpManaged: result.summary.totalMW.toFixed(2),
        }));

        toast({
          title: "✅ Sync Successful",
          description: `Synced ${result.summary.totalSites} sites (${result.summary.ongridSites} on-grid, ${result.summary.hybridSites} hybrid) - Total: ${result.summary.totalMW.toFixed(2)} MWp, Solcast: ${result.summary.sitesWithSolcast} sites`,
        });
      }
      // For new customers, fetch and store in temp state
      else {
        // Fetch assets directly without saving to DB yet
        const allAssets = await dataApiClient.listAssets();
        const orgAssets = allAssets.filter((a: any) => a.org_id === formData.ammpOrgId);
        
        if (orgAssets.length === 0) {
          throw new Error(`No assets found for org_id: ${formData.ammpOrgId}`);
        }

        // Calculate capabilities with progress
        const capabilities = [];
        for (let i = 0; i < orgAssets.length; i++) {
          const asset = orgAssets[i];
          setSyncProgress({ current: i + 1, total: orgAssets.length, assetName: asset.asset_name });
          const cap = await calculateCapabilities(asset.asset_id);
          capabilities.push(cap);
        }
        
        const ongridSites = capabilities.filter(c => !c.hasBattery && !c.hasGenset);
        const hybridSites = capabilities.filter(c => c.hasBattery || c.hasGenset);
        
        const summary = {
          totalMW: capabilities.reduce((sum, cap) => sum + cap.totalMW, 0),
          ongridTotalMW: ongridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
          hybridTotalMW: hybridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
          totalSites: capabilities.length,
          ongridSites: ongridSites.length,
          hybridSites: hybridSites.length,
          sitesWithSolcast: capabilities.filter(c => c.hasSolcast).length,
          assetBreakdown: capabilities.map(c => ({
            assetId: c.assetId,
            assetName: c.assetName,
            totalMW: c.totalMW,
            isHybrid: c.hasBattery || c.hasGenset,
            hasSolcast: c.hasSolcast,
            deviceCount: c.deviceCount,
          }))
        };

        // Import detectSyncAnomalies from ammpService
        const { detectSyncAnomalies } = await import('@/services/ammp/ammpService');
        const anomalies = detectSyncAnomalies(capabilities);

        // Store in temp state
        setSyncedCapabilities(summary);
        setSyncAnomalies(anomalies);
        setSyncedAssets(orgAssets.map((a: any) => a.asset_id));
        setFormData(prev => ({
          ...prev,
          mwpManaged: summary.totalMW.toFixed(2),
        }));

        toast({
          title: "✅ Assets Loaded",
          description: `Found ${summary.totalSites} sites (${summary.ongridSites} on-grid, ${summary.hybridSites} hybrid) - Total: ${summary.totalMW.toFixed(2)} MWp. Data will be saved when you create the customer.`,
        });
      }
    } catch (error) {
      console.error('AMMP sync error:', error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync from AMMP",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const fetchDevicesForAsset = async (assetId: string) => {
    setAssetsWithDevices(prev => {
      const newMap = new Map(prev);
      newMap.set(assetId, { devices: [], loading: true, error: null });
      return newMap;
    });

    try {
      const devices = await dataApiClient.getAssetDevices(assetId);
      setAssetsWithDevices(prev => {
        const newMap = new Map(prev);
        newMap.set(assetId, { 
          devices: Array.isArray(devices) ? devices : [], 
          loading: false, 
          error: null 
        });
        return newMap;
      });
    } catch (error: any) {
      setAssetsWithDevices(prev => {
        const newMap = new Map(prev);
        newMap.set(assetId, { 
          devices: [], 
          loading: false, 
          error: error.message || "Failed to load devices" 
        });
        return newMap;
      });
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    if (!deviceType) return Database;
    if (deviceType.includes('inverter')) return Zap;
    if (deviceType.includes('battery')) return Battery;
    if (deviceType.includes('meter') || deviceType.includes('monitor')) return Activity;
    return Database;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Asset ID copied to clipboard",
    });
  };

  const handleClearAmmpData = () => {
    // Clear all AMMP-related state
    setFormData(prev => ({
      ...prev,
      ammpOrgId: "",
      mwpManaged: "", // Reset MWp too
    }));
    setSyncedAssets([]);
    setSyncedCapabilities(null);
    setSyncAnomalies(null);
    setAssetsWithDevices(new Map());
    
    toast({
      title: "AMMP Data Cleared",
      description: "All AMMP integration data has been removed from this customer.",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.location) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if status was manually changed
      const statusChanged = existingCustomer && formData.status !== originalStatus;
      
      const customerData = {
        name: formData.name,
        location: formData.location,
        mwp_managed: syncedCapabilities 
          ? syncedCapabilities.totalMW 
          : (formData.mwpManaged ? parseFloat(formData.mwpManaged) : 0),
        status: formData.status,
        ammp_org_id: formData.ammpOrgId || null,
        ammp_asset_ids: syncedAssets.length > 0 ? syncedAssets : null,
        ammp_capabilities: syncedCapabilities || null,
        ammp_sync_status: syncedCapabilities ? 'synced' : null,
        last_ammp_sync: syncedCapabilities ? new Date().toISOString() : null,
        // Set manual_status_override to true if status was manually changed
        manual_status_override: statusChanged ? true : (existingCustomer?.manual_status_override || false),
        user_id: user.id,
      };

      if (existingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', existingCustomer.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([customerData]);

        if (error) throw error;
      }

      toast({
        title: existingCustomer ? "Customer Updated" : "Customer Created",
        description: `${formData.name} has been successfully ${existingCustomer ? "updated" : "added"}.`,
      });
      onComplete();
    } catch (error) {
      console.error('Error saving customer:', error);
      toast({
        title: "Error",
        description: "Failed to save customer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-2">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Customer Name*</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter customer name"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location*</Label>
            <Input
              id="location"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              placeholder="City, Country"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="mwpManaged">Total MWp Managed</Label>
            <Input
              id="mwpManaged"
              name="mwpManaged"
              type="number"
              step="0.1"
              value={formData.mwpManaged}
              onChange={handleInputChange}
              placeholder="0.0"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="status">Customer Status</Label>
              {existingCustomer?.manual_status_override && (
                <Badge variant="outline" className="text-xs">
                  Manually managed
                </Badge>
              )}
            </div>
            <Select 
              value={formData.status}
              onValueChange={(value) => handleSelectChange("status", value)}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {formData.status !== originalStatus && (
              <p className="text-xs text-muted-foreground">
                Status will be manually managed (Xero sync won't change it)
              </p>
            )}
          </div>
        </div>

        {/* AMMP Integration Section */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <h3 className="font-medium text-sm">AMMP Integration (Optional)</h3>
          
          <div className="space-y-2">
            <Label htmlFor="ammpOrgId">AMMP Organization ID</Label>
            <Input
              id="ammpOrgId"
              name="ammpOrgId"
              value={formData.ammpOrgId}
              onChange={handleInputChange}
              placeholder="e.g., org_abc123..."
              className="w-full"
            />
            <Button 
              type="button"
              variant="outline"
              onClick={handleSyncFromAMMP}
              disabled={!formData.ammpOrgId || isSyncing}
              className="w-full"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {syncedCapabilities ? "Re-sync from AMMP" : "Sync from AMMP"}
                </>
              )}
            </Button>
              
            {isSyncing && syncProgress && (
              <div className="space-y-2 mt-3">
                <Progress value={(syncProgress.current / syncProgress.total) * 100} />
                <p className="text-xs text-muted-foreground text-center">
                  Syncing asset {syncProgress.current} of {syncProgress.total}: {syncProgress.assetName}
                </p>
              </div>
            )}
            
            {syncAnomalies?.hasAnomalies && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Sync completed with warnings</AlertTitle>
                <AlertDescription className="space-y-2">
                  {syncAnomalies.warnings?.map((warning, idx) => (
                    <p key={idx} className="text-sm">{warning}</p>
                  ))}
                  <div className="mt-3 p-2 bg-muted rounded text-xs">
                    <p><strong>Stats:</strong></p>
                    <p>• Total assets: {syncAnomalies.stats.totalAssets}</p>
                    <p>• Assets with devices: {syncAnomalies.stats.assetsWithDevices}</p>
                    <p>• Assets with no devices: {syncAnomalies.stats.assetsWithNoDevices}</p>
                  </div>
                  <p className="text-xs mt-2">
                    💡 <strong>Tip:</strong> Check your AMMP API key permissions or contact AMMP support.
                  </p>
                </AlertDescription>
              </Alert>
            )}
            
            <p className="text-xs text-muted-foreground">
              {syncedCapabilities 
                ? `Last synced: ${syncedAssets.length} assets loaded`
                : "Link to AMMP for automatic MW and site data sync"}
            </p>
            {formData.ammpOrgId && !syncedCapabilities && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Org ID not yet validated - click sync to verify
              </p>
            )}
          </div>

          {syncedCapabilities && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">AMMP Synced Assets</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {syncedAssets.length} total
                  </span>
                  <Button 
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAmmpData}
                    className="text-destructive hover:text-destructive h-8"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
              
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Sites:</span>
                  <span className="font-medium">{syncedCapabilities.totalSites || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total MW:</span>
                  <span className="font-medium">{(syncedCapabilities.totalMW || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">On-Grid:</span>
                  <span className="font-medium">
                    {syncedCapabilities.ongridSites || 0} ({(syncedCapabilities.ongridTotalMW || 0).toFixed(2)} MWp)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hybrid:</span>
                  <span className="font-medium">
                    {syncedCapabilities.hybridSites || 0} ({(syncedCapabilities.hybridTotalMW || 0).toFixed(2)} MWp)
                  </span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Solcast-enabled:</span>
                  <span className="font-medium">{syncedCapabilities.sitesWithSolcast || 0} sites</span>
                </div>
              </div>

              {/* Collapsible Asset Breakdown */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <ChevronDown className="h-4 w-4" />
                  <span>View asset details</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <Accordion type="single" collapsible className="w-full">
                    {syncedCapabilities?.assetBreakdown?.map((asset: any) => (
                      <AccordionItem key={asset.assetId} value={asset.assetId}>
                        <AccordionTrigger 
                          className="hover:no-underline"
                          onClick={() => {
                            if (!assetsWithDevices.has(asset.assetId)) {
                              fetchDevicesForAsset(asset.assetId);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{asset.assetName}</span>
                              {asset.isHybrid && (
                                <Badge variant="secondary" className="text-xs">Hybrid</Badge>
                              )}
                              {asset.hasSolcast && (
                                <Badge variant="outline" className="text-xs">Solcast</Badge>
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {(asset.totalMW || 0).toFixed(2)} MWp
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pt-2">
                            {/* Asset ID */}
                            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                              <span className="text-xs text-muted-foreground">Asset ID:</span>
                              <code className="text-xs font-mono flex-1">{asset.assetId}</code>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(asset.assetId)}
                                className="h-6 w-6 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Devices Table */}
                            <div>
                              <h4 className="text-sm font-medium mb-2">Devices</h4>
                              {assetsWithDevices.get(asset.assetId)?.loading && (
                                <div className="space-y-2">
                                  <Skeleton className="h-8 w-full" />
                                  <Skeleton className="h-8 w-full" />
                                  <Skeleton className="h-8 w-full" />
                                </div>
                              )}
                              
                              {assetsWithDevices.get(asset.assetId)?.error && (
                                <div className="text-center py-4">
                                  <p className="text-sm text-destructive mb-2">
                                    {assetsWithDevices.get(asset.assetId)?.error}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fetchDevicesForAsset(asset.assetId)}
                                  >
                                    Retry
                                  </Button>
                                </div>
                              )}
                              
                              {!assetsWithDevices.get(asset.assetId)?.loading && 
                               !assetsWithDevices.get(asset.assetId)?.error && (
                                <>
                                  {assetsWithDevices.get(asset.assetId)?.devices.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                      No devices configured for this asset
                                    </p>
                                  ) : (
                                    <div className="border rounded-md">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Device</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Manufacturer</TableHead>
                                            <TableHead>Provider</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {assetsWithDevices.get(asset.assetId)?.devices?.map((device, idx) => {
                                            const Icon = getDeviceIcon(device.device_type);
                                            return (
                                              <TableRow key={idx}>
                                                <TableCell className="font-medium text-sm">
                                                  <div className="flex items-center gap-2">
                                                    <Icon className="h-3 w-3 text-muted-foreground" />
                                                    {device.device_name || device.device_id}
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                  <Badge variant="outline" className="text-xs">
                                                    {device.device_type?.replace(/_/g, ' ') || 'Unknown'}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                  {device.manufacturer || 'N/A'}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                  <Badge variant="secondary" className="text-xs">
                                                    {device.data_provider}
                                                  </Badge>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {!syncedCapabilities && formData.ammpOrgId && (
            <div className="p-3 border border-dashed rounded-lg text-center text-sm text-muted-foreground">
              Click "Sync from AMMP" to load asset data
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button 
            className="w-full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {existingCustomer ? "Updating..." : "Creating..."}
              </>
            ) : existingCustomer ? "Update Customer" : "Add Customer"}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default CustomerForm;
