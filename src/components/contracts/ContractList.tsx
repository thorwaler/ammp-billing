import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Download, Search, MoreHorizontal, Pencil, Eye, CalendarIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ContractForm from "@/components/contracts/ContractForm";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Contract {
  id: string;
  companyName: string;
  contractName?: string;
  status: "active" | "pending" | "expired" | "cancelled";
  currency: string;
  periodStart?: string;
  periodEnd?: string;
  signedDate?: string;
  initialMW: number;
  package: string;
  customerId: string;
}

const STATUS_OPTIONS = ["active", "pending", "expired", "cancelled"] as const;
const PAGE_SIZE = 10;

export function ContractList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateRangeStart, setDateRangeStart] = useState<Date | undefined>();
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | undefined>();
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const navigate = useNavigate();

  const loadContracts = useCallback(async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Build base query
    let query = supabase
      .from('contracts')
      .select(`
        id,
        company_name,
        contract_name,
        contract_status,
        currency,
        period_start,
        period_end,
        signed_date,
        initial_mw,
        package,
        customer_id
      `, { count: 'exact' });

    // Apply search filter
    if (searchTerm) {
      query = query.or(`company_name.ilike.%${searchTerm}%,contract_name.ilike.%${searchTerm}%`);
    }

    // Apply status filter
    if (statusFilter.length > 0) {
      query = query.in('contract_status', statusFilter);
    }

    // Apply date range filter (on period_start)
    if (dateRangeStart) {
      query = query.gte('period_start', dateRangeStart.toISOString());
    }
    if (dateRangeEnd) {
      query = query.lte('period_start', dateRangeEnd.toISOString());
    }

    // Apply pagination
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error loading contracts:', error);
      toast({
        title: "Error loading contracts",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const transformed: Contract[] = (data || []).map(c => ({
      id: c.id,
      companyName: c.company_name,
      contractName: c.contract_name || undefined,
      status: (c.contract_status || 'active') as Contract['status'],
      currency: c.currency || 'EUR',
      periodStart: c.period_start || undefined,
      periodEnd: c.period_end || undefined,
      signedDate: c.signed_date || undefined,
      initialMW: c.initial_mw || 0,
      package: c.package,
      customerId: c.customer_id,
    }));

    setContracts(transformed);
    setTotalCount(count || 0);
    setIsLoading(false);
  }, [searchTerm, statusFilter, dateRangeStart, dateRangeEnd, currentPage]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateRangeStart, dateRangeEnd]);

  const handleEdit = async (contractId: string) => {
    setIsLoadingEdit(true);
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) {
        toast({ title: "Contract not found", variant: "destructive" });
        return;
      }

      // Transform to expected format for ContractForm
      setSelectedContract({
        id: data.id,
        contractName: data.contract_name || undefined,
        package: data.package,
        modules: data.modules || [],
        addons: data.addons || [],
        initialMW: data.initial_mw,
        billingFrequency: data.billing_frequency || 'annual',
        manualInvoicing: data.manual_invoicing,
        nextInvoiceDate: data.next_invoice_date,
        customPricing: data.custom_pricing,
        volumeDiscounts: data.volume_discounts,
        minimumCharge: data.minimum_charge,
        minimumAnnualValue: data.minimum_annual_value,
        baseMonthlyPrice: data.base_monthly_price,
        retainerHours: data.retainer_hours,
        retainerHourlyRate: data.retainer_hourly_rate,
        retainerMinimumValue: data.retainer_minimum_value,
        onboardingFeePerSite: data.onboarding_fee_per_site,
        annualFeePerSite: data.annual_fee_per_site,
        maxMw: data.max_mw,
        currency: data.currency || 'EUR',
        signedDate: data.signed_date,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        notes: data.notes,
        contractStatus: data.contract_status,
        portfolioDiscountTiers: data.portfolio_discount_tiers,
        minimumChargeTiers: data.minimum_charge_tiers,
        siteChargeFrequency: data.site_charge_frequency,
        contractExpiryDate: data.contract_expiry_date,
        ammpAssetGroupId: data.ammp_asset_group_id,
        ammpAssetGroupName: data.ammp_asset_group_name,
        ammpAssetGroupIdAnd: data.ammp_asset_group_id_and,
        ammpAssetGroupNameAnd: data.ammp_asset_group_name_and,
        ammpAssetGroupIdNot: data.ammp_asset_group_id_not,
        ammpAssetGroupNameNot: data.ammp_asset_group_name_not,
        contractAmmpOrgId: data.contract_ammp_org_id,
        siteSizeThresholdKwp: data.site_size_threshold_kwp,
        belowThresholdPricePerMWp: data.below_threshold_price_per_mwp,
        aboveThresholdPricePerMWp: data.above_threshold_price_per_mwp,
        ammpOrgId: data.ammp_org_id,
        ammpSyncStatus: data.ammp_sync_status,
        lastAmmpSync: data.last_ammp_sync,
        cachedCapabilities: data.cached_capabilities,
        graduatedMWTiers: data.graduated_mw_tiers,
      });
      setShowEditForm(true);
    } catch (error: any) {
      toast({ title: "Error loading contract", description: error.message, variant: "destructive" });
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleDownload = (contractId: string) => {
    toast({
      title: "Download started",
      description: `Downloading contract ${contractId.slice(0, 8)}...`,
    });
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter([]);
    setDateRangeStart(undefined);
    setDateRangeEnd(undefined);
  };

  const hasActiveFilters = searchTerm || statusFilter.length > 0 || dateRangeStart || dateRangeEnd;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getStatusVariant = (status: Contract['status']) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'outline';
      case 'expired': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '—';
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="text-xl flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Contracts
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({totalCount} total)
          </span>
        </CardTitle>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company or contract name..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map((status) => (
              <Button
                key={status}
                variant={statusFilter.includes(status) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleStatusFilter(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>

          {/* Date Range Start */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-2", dateRangeStart && "bg-accent")}>
                <CalendarIcon className="h-4 w-4" />
                {dateRangeStart ? format(dateRangeStart, 'dd MMM yyyy') : 'Start Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRangeStart}
                onSelect={setDateRangeStart}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Date Range End */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-2", dateRangeEnd && "bg-accent")}>
                <CalendarIcon className="h-4 w-4" />
                {dateRangeEnd ? format(dateRangeEnd, 'dd MMM yyyy') : 'End Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRangeEnd}
                onSelect={setDateRangeEnd}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Package</TableHead>
                <TableHead className="text-right">Initial MW</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Loading contracts...
                  </TableCell>
                </TableRow>
              ) : contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No contracts found
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell 
                      className="font-medium cursor-pointer hover:text-primary" 
                      onClick={() => navigate(`/contracts/${contract.id}`)}
                    >
                      {contract.companyName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contract.contractName || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(contract.status)} className="capitalize">
                        {contract.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{contract.package}</TableCell>
                    <TableCell className="text-right">{contract.initialMW.toFixed(2)}</TableCell>
                    <TableCell>{formatDate(contract.periodStart)}</TableCell>
                    <TableCell>{formatDate(contract.periodEnd)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEdit(contract.id)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => navigate(`/contracts/${contract.id}`)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDownload(contract.id)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Contract</DialogTitle>
            </DialogHeader>
            {selectedContract && (
              <ContractForm 
                existingContract={selectedContract}
                onCancel={() => {
                  setShowEditForm(false);
                  setSelectedContract(null);
                }}
                onComplete={() => {
                  setShowEditForm(false);
                  setSelectedContract(null);
                  loadContracts();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default ContractList;
