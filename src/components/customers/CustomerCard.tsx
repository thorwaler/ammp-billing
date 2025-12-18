import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, BarChart, MoreHorizontal, CheckCircle2, AlertCircle, PlusCircle, Eye } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CustomerForm from "./CustomerForm";
import ContractForm from "../contracts/ContractForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getModuleById, getAddonById } from "@/data/pricingData";
import { getCustomerDisplayName } from "@/utils/customerUtils";
import { formatDateCET } from "@/lib/dateUtils";

const getDisplayName = (id: string, isModule: boolean): string => {
  // Special case for Satellite Data API
  if (id === 'satelliteDataAPI') return 'Solcast';
  
  if (isModule) {
    const module = getModuleById(id);
    return module?.name || id;
  } else {
    const addon = getAddonById(id);
    return addon?.name || id;
  }
};

interface CustomerCardProps {
  id: string;
  name: string;
  nickname?: string | null;
  location: string;
  contractValue: string;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  modules: string[];
  addOns: string[];
  package?: string;
  joinDate?: string;
  lastInvoiced?: string;
  contractId?: string;
  hasContract: boolean;
  contractCount?: number;
  contracts?: Array<{
    id: string;
    contract_name?: string;
    package: string;
    contract_status: string;
    signed_date?: string;
    period_start?: string;
    period_end?: string;
    company_name?: string;
    cached_capabilities?: any;
    // AMMP fields
    ammp_org_id?: string;
    ammp_asset_group_id?: string;
    ammp_asset_group_name?: string;
    ammp_asset_group_id_and?: string;
    ammp_asset_group_name_and?: string;
    ammp_asset_group_id_not?: string;
    ammp_asset_group_name_not?: string;
    // Other contract fields
    modules?: any;
    addons?: any;
    custom_pricing?: any;
    minimum_annual_value?: number;
    minimum_charge?: number;
    minimum_charge_tiers?: any;
    portfolio_discount_tiers?: any;
    site_charge_frequency?: string;
    volume_discounts?: any;
    currency?: string;
    billing_frequency?: string;
    base_monthly_price?: number;
    initial_mw?: number;
    annual_fee_per_site?: number;
    retainer_hours?: number;
    retainer_hourly_rate?: number;
    retainer_minimum_value?: number;
    site_size_threshold_kwp?: number;
    below_threshold_price_per_mwp?: number;
    above_threshold_price_per_mwp?: number;
    contract_expiry_date?: string;
    notes?: string;
    max_mw?: number;
    onboarding_fee_per_site?: number;
  }>;
  onViewContract?: () => void;
  onViewDetails?: () => void;
  onContractCreated?: () => void;
}

export function CustomerCard({
  id,
  name,
  nickname,
  location,
  contractValue,
  mwpManaged,
  status,
  modules,
  addOns,
  package: packageType,
  joinDate,
  lastInvoiced,
  contractId,
  hasContract,
  contractCount = 1,
  contracts = [],
  onViewContract,
  onViewDetails,
  onContractCreated,
}: CustomerCardProps) {
  const displayName = getCustomerDisplayName({ name, nickname });
  const navigate = useNavigate();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [showAddContractForm, setShowAddContractForm] = useState(false);
  const [showContractSelector, setShowContractSelector] = useState(false);
  const [contractSelectorAction, setContractSelectorAction] = useState<'view' | 'edit'>('view');
  const [selectedContractForEdit, setSelectedContractForEdit] = useState<any | null>(null);
  const [showAssetsDialog, setShowAssetsDialog] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);

  // Aggregate assets from all contracts
  const allAssets = contracts?.flatMap(c => 
    (c.cached_capabilities as any)?.assetBreakdown?.map((asset: any) => ({
      ...asset,
      contractName: c.contract_name || `${c.package} Contract`,
      contractId: c.id
    })) || []
  ) || [];

  const handleMarkInactive = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update customer status
      const { error: customerError } = await supabase
        .from('customers')
        .update({ status: 'inactive' })
        .eq('id', id)
        .eq('user_id', user.id);

      if (customerError) throw customerError;

      // Expire active contract (CASCADE)
      const { error: contractError } = await supabase
        .from('contracts')
        .update({ contract_status: 'expired' })
        .eq('customer_id', id)
        .eq('user_id', user.id)
        .eq('contract_status', 'active');

      if (contractError) throw contractError;

      toast({
        title: "Customer marked inactive",
        description: "Customer and their active contract have been marked inactive.",
      });

      onContractCreated?.();
    } catch (error) {
      console.error('Error marking customer inactive:', error);
      toast({
        title: "Error",
        description: "Failed to update customer status",
        variant: "destructive",
      });
    }
  };

  const handleReactivate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('customers')
        .update({ status: 'active' })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Customer reactivated",
        description: "Customer is now active. Contract remains expired and must be reactivated separately.",
      });

      onContractCreated?.();
    } catch (error) {
      console.error('Error reactivating customer:', error);
      toast({
        title: "Error",
        description: "Failed to reactivate customer",
        variant: "destructive",
      });
    }
  };

  const formattedJoinDate = joinDate 
    ? formatDateCET(joinDate, 'MMM d, yyyy')
    : undefined;
  
  const formattedLastInvoiced = lastInvoiced 
    ? formatDateCET(lastInvoiced, 'MMM d, yyyy')
    : "Not yet invoiced";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <CardTitle className="text-lg">{displayName}</CardTitle>
            {contractCount > 1 && (
              <span className="text-xs text-muted-foreground mt-1">
                {contractCount} contracts
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* POC Badge - shown separately */}
            {packageType === 'poc' && hasContract && (
              <Badge variant="outline" className="bg-purple-600/20 text-purple-400 border-purple-500">
                POC
              </Badge>
            )}
            <Badge 
              variant={
                status === 'inactive' ? 'outline' : 
                !hasContract ? 'destructive' : 
                'default'
              }
              className={
                status === 'inactive' ? 'bg-gray-600 hover:bg-gray-700 text-white border-gray-600' : 
                !hasContract ? '' : 
                status === 'pending' ? 'bg-yellow-600 hover:bg-yellow-700' :
                'bg-green-600 hover:bg-green-700'
              }
            >
              {status === 'inactive' ? (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Inactive Customer
                </>
              ) : !hasContract ? (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  No Contract
                </>
              ) : status === 'pending' ? (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Pending Setup
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Active
                </>
              )}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      Edit Customer
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Customer: {displayName}</DialogTitle>
                    </DialogHeader>
                    <CustomerForm 
                      onComplete={() => {
                        setShowEditForm(false);
                        onContractCreated?.();
                      }} 
                      existingCustomer={{
                        id,
                        name,
                        nickname,
                        location,
                        mwpManaged,
                        status,
                      }}
                    />
                  </DialogContent>
                </Dialog>
                <DropdownMenuSeparator />
                {status === 'active' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Mark as Inactive
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark Customer as Inactive</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark the customer inactive and expire their active contract. No more invoices will be generated.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleMarkInactive}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Reactivate Customer
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reactivate Customer</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will reactivate the customer. Their contract will remain expired and must be reactivated separately.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReactivate}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{location}</p>
        {formattedJoinDate && (
          <p className="text-xs text-muted-foreground">Customer since {formattedJoinDate}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Contract Value</div>
            <div className="font-medium">{contractValue}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">MWp Managed</div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{mwpManaged.toFixed(2)} MWp</span>
              {allAssets.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowAssetsDialog(true)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  {allAssets.length} assets
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Last Invoiced</div>
            <div className="font-medium">{formattedLastInvoiced}</div>
          </div>
          {(modules.length > 0 || packageType === 'hybrid_tiered') && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Modules</div>
              <div className="flex flex-wrap gap-1">
                {packageType === 'hybrid_tiered' ? (
                  <>
                    <Badge variant="outline" className="text-xs">
                      Technical Monitoring
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Hybrid
                    </Badge>
                  </>
                ) : (
                  modules.map((moduleId) => (
                    <Badge key={moduleId} variant="outline" className="text-xs">
                      {getDisplayName(moduleId, true)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          )}
          {addOns.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Add-ons</div>
              <div className="flex flex-wrap gap-1">
                {addOns.map((addonId) => (
                  <Badge key={addonId} variant="outline" className="text-xs">
                    {getDisplayName(addonId, false)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {hasContract ? (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    if (contractCount > 1) {
                      setShowContractSelector(true);
                    } else {
                      onViewContract?.();
                    }
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {contractCount > 1 ? 'Contracts' : 'View'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    if (contractCount > 1) {
                      setShowContractSelector(true);
                    } else {
                      onViewDetails?.();
                    }
                  }}
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  Details
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    if (contractCount > 1) {
                      setContractSelectorAction('edit');
                      setShowContractSelector(true);
                    } else {
                      // Single contract - directly open edit form
                      const c = contracts.find(ct => ct.contract_status === 'active') || contracts[0];
                      setSelectedContractForEdit(c);
                      setShowContractForm(true);
                    }
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                {/* Edit Contract Dialog - uses selectedContractForEdit */}
                <Dialog open={showContractForm} onOpenChange={(open) => {
                  setShowContractForm(open);
                  if (!open) setSelectedContractForEdit(null);
                }}>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Contract: {displayName}</DialogTitle>
                    </DialogHeader>
                    {selectedContractForEdit && (
                      <ContractForm 
                        existingCustomer={{ id, name, nickname, location, mwpManaged }}
                        existingContract={{
                          id: selectedContractForEdit.id,
                          contractName: selectedContractForEdit.contract_name,
                          package: selectedContractForEdit.package,
                          signedDate: selectedContractForEdit.signed_date,
                          periodStart: selectedContractForEdit.period_start,
                          periodEnd: selectedContractForEdit.period_end,
                          cachedCapabilities: selectedContractForEdit.cached_capabilities,
                          // AMMP fields
                          ammpOrgId: selectedContractForEdit.ammp_org_id,
                          ammpAssetGroupId: selectedContractForEdit.ammp_asset_group_id,
                          ammpAssetGroupName: selectedContractForEdit.ammp_asset_group_name,
                          ammpAssetGroupIdAnd: selectedContractForEdit.ammp_asset_group_id_and,
                          ammpAssetGroupNameAnd: selectedContractForEdit.ammp_asset_group_name_and,
                          ammpAssetGroupIdNot: selectedContractForEdit.ammp_asset_group_id_not,
                          ammpAssetGroupNameNot: selectedContractForEdit.ammp_asset_group_name_not,
                          // Other contract fields
                          modules: selectedContractForEdit.modules,
                          addons: selectedContractForEdit.addons,
                          customPricing: selectedContractForEdit.custom_pricing,
                          minimumAnnualValue: selectedContractForEdit.minimum_annual_value,
                          minimumCharge: selectedContractForEdit.minimum_charge,
                          minimumChargeTiers: selectedContractForEdit.minimum_charge_tiers,
                          portfolioDiscountTiers: selectedContractForEdit.portfolio_discount_tiers,
                          siteChargeFrequency: selectedContractForEdit.site_charge_frequency,
                          volumeDiscounts: selectedContractForEdit.volume_discounts,
                          currency: selectedContractForEdit.currency,
                          billingFrequency: selectedContractForEdit.billing_frequency,
                          baseMonthlyPrice: selectedContractForEdit.base_monthly_price,
                          initialMW: selectedContractForEdit.initial_mw,
                          annualFeePerSite: selectedContractForEdit.annual_fee_per_site,
                          retainerHours: selectedContractForEdit.retainer_hours,
                          retainerHourlyRate: selectedContractForEdit.retainer_hourly_rate,
                          retainerMinimumValue: selectedContractForEdit.retainer_minimum_value,
                          siteSizeThresholdKwp: selectedContractForEdit.site_size_threshold_kwp,
                          belowThresholdPricePerMWp: selectedContractForEdit.below_threshold_price_per_mwp,
                          aboveThresholdPricePerMWp: selectedContractForEdit.above_threshold_price_per_mwp,
                          contractExpiryDate: selectedContractForEdit.contract_expiry_date,
                          notes: selectedContractForEdit.notes,
                          maxMw: selectedContractForEdit.max_mw,
                          onboardingFeePerSite: selectedContractForEdit.onboarding_fee_per_site,
                        }}
                        onComplete={() => {
                          setShowContractForm(false);
                          setSelectedContractForEdit(null);
                          onContractCreated?.();
                        }}
                        onCancel={() => {
                          setShowContractForm(false);
                          setSelectedContractForEdit(null);
                        }}
                      />
                    )}
                  </DialogContent>
                </Dialog>
                <Dialog open={showAddContractForm} onOpenChange={setShowAddContractForm}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Contract: {displayName}</DialogTitle>
                    </DialogHeader>
                    <ContractForm 
                      existingCustomer={{ id, name, nickname, location, mwpManaged }}
                      isNewContract={true}
                      onComplete={() => {
                        setShowAddContractForm(false);
                        onContractCreated?.();
                      }}
                      onCancel={() => setShowAddContractForm(false)}
                    />
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <>
                <Dialog open={showContractForm} onOpenChange={setShowContractForm}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="col-span-2">
                      <FileText className="mr-2 h-4 w-4" />
                      Setup Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Contract: {name}</DialogTitle>
                    </DialogHeader>
                    <ContractForm 
                      existingCustomer={{ id, name, location, mwpManaged }}
                      onComplete={() => {
                        setShowContractForm(false);
                        onContractCreated?.();
                      }}
                      onCancel={() => setShowContractForm(false)}
                    />
                  </DialogContent>
                </Dialog>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="col-span-2"
                  onClick={onViewDetails}
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  Details
                </Button>
              </>
            )}
          </div>
          
          {/* Contract Selector Dialog */}
          <Dialog open={showContractSelector} onOpenChange={setShowContractSelector}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {contractSelectorAction === 'edit' ? 'Select Contract to Edit' : 'Select Contract'} - {name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {contracts.map((contract) => (
                  <div 
                    key={contract.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {contract.contract_name || `${contract.package} Contract`}
                        </span>
                        <Badge 
                          variant={contract.contract_status === 'active' ? 'default' : 'outline'}
                          className={contract.contract_status === 'active' ? 'bg-green-600' : ''}
                        >
                          {contract.contract_status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">
                        Package: {contract.package}
                      </span>
                      {contract.signed_date && (
                        <span className="text-sm text-muted-foreground">
                          Signed: {new Date(contract.signed_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {contractSelectorAction === 'edit' ? (
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedContractForEdit(contract);
                          setShowContractSelector(false);
                          setShowContractForm(true);
                        }}
                      >
                        Edit
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        onClick={() => {
                          navigate(`/contracts/${contract.id}`);
                          setShowContractSelector(false);
                        }}
                      >
                        View
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* Assets Dialog */}
          <Dialog open={showAssetsDialog} onOpenChange={setShowAssetsDialog}>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Assets - {displayName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">
                    {allAssets.length} sites • {allAssets.reduce((sum: number, a: any) => sum + (a.totalMW || 0), 0).toFixed(2)} MW
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Switch 
                      id="show-all-assets" 
                      checked={showAllAssets} 
                      onCheckedChange={setShowAllAssets}
                    />
                    <Label htmlFor="show-all-assets" className="text-sm">Show All</Label>
                  </div>
                </div>
                <div className={showAllAssets ? "" : "max-h-96 overflow-auto"}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset Name</TableHead>
                        <TableHead className="text-right">MW</TableHead>
                        <TableHead className="text-center">Hybrid</TableHead>
                        <TableHead className="text-center">Solcast</TableHead>
                        <TableHead>Contract</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allAssets.map((asset: any) => (
                        <TableRow 
                          key={`${asset.contractId}-${asset.assetId}`}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedAsset(asset)}
                        >
                          <TableCell className="font-medium">{asset.assetName}</TableCell>
                          <TableCell className="text-right">{asset.totalMW?.toFixed(4)}</TableCell>
                          <TableCell className="text-center">{asset.isHybrid ? '✓' : '-'}</TableCell>
                          <TableCell className="text-center">{asset.hasSolcast ? '✓' : '-'}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{asset.contractName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">Click an asset row to view device details</p>
              </div>
            </DialogContent>
          </Dialog>

          {/* Device Details Dialog */}
          <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Devices - {selectedAsset?.assetName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{selectedAsset?.totalMW?.toFixed(4)} MW</Badge>
                  {selectedAsset?.isHybrid && <Badge className="bg-orange-500">Hybrid</Badge>}
                  {selectedAsset?.hasSolcast && <Badge className="bg-blue-500">Solcast</Badge>}
                </div>
                {selectedAsset?.devices && selectedAsset.devices.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Manufacturer</TableHead>
                        <TableHead>Model</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedAsset.devices.map((device: any) => (
                        <TableRow key={device.deviceId}>
                          <TableCell className="font-medium">{device.deviceName}</TableCell>
                          <TableCell>{device.deviceType}</TableCell>
                          <TableCell>{device.manufacturer || '-'}</TableCell>
                          <TableCell>{device.model || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No device data available.</p>
                    <p className="text-sm mt-1">Re-sync the contract from Contract Details to fetch device information.</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default CustomerCard;
