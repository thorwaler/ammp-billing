import { useState, useMemo } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Info, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInvoiceAlerts } from "@/hooks/useInvoiceAlerts";
import { AlertCard } from "@/components/alerts/AlertCard";
import { AlertFilters } from "@/components/alerts/AlertFilters";
import { AcknowledgeDialog } from "@/components/alerts/AcknowledgeDialog";
import { AlertSettingsDialog } from "@/components/alerts/AlertSettingsDialog";
import { toast } from "@/hooks/use-toast";

export default function Alerts() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    alerts,
    loading,
    refetch,
    acknowledgeAlert,
    deleteAlert,
    criticalCount,
    warningCount,
    infoCount,
  } = useInvoiceAlerts();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unacknowledged" | "acknowledged">("unacknowledged");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Acknowledge dialog state
  const [acknowledgeDialogOpen, setAcknowledgeDialogOpen] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const selectedAlert = alerts.find(a => a.id === selectedAlertId);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      // Status filter
      if (statusFilter === "unacknowledged" && alert.is_acknowledged) return false;
      if (statusFilter === "acknowledged" && !alert.is_acknowledged) return false;

      // Severity filter
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;

      // Type filter
      if (typeFilter !== "all" && alert.alert_type !== typeFilter) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesDescription = alert.description.toLowerCase().includes(query);
        const matchesCustomer = alert.customer?.name?.toLowerCase().includes(query) || 
                                alert.customer?.nickname?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription && !matchesCustomer) return false;
      }

      return true;
    });
  }, [alerts, statusFilter, severityFilter, typeFilter, searchQuery]);

  const handleAcknowledge = (alertId: string) => {
    setSelectedAlertId(alertId);
    setAcknowledgeDialogOpen(true);
  };

  const handleConfirmAcknowledge = async (note: string) => {
    if (!selectedAlertId) return;

    setIsAcknowledging(true);
    try {
      await acknowledgeAlert(selectedAlertId, note);
      toast({
        title: "Alert acknowledged",
        description: "The alert has been marked as acknowledged.",
      });
      setAcknowledgeDialogOpen(false);
      setSelectedAlertId(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to acknowledge alert. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleDelete = async (alertId: string) => {
    try {
      await deleteAlert(alertId);
      toast({
        title: "Alert deleted",
        description: "The alert has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete alert. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Invoice Alerts</h1>
            <p className="text-muted-foreground">
              Monitor anomalies and sanity checks for invoices and contracts
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline" onClick={refetch} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
              <p className="text-xs text-muted-foreground">Require immediate attention</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warning</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{warningCount}</div>
              <p className="text-xs text-muted-foreground">Should be reviewed</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Info</CardTitle>
              <Info className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">{infoCount}</div>
              <p className="text-xs text-muted-foreground">For your information</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <AlertFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          </CardContent>
        </Card>

        {/* Alerts List */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Loading alerts...</p>
              </CardContent>
            </Card>
          ) : filteredAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Info className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  {alerts.length === 0
                    ? "No alerts found. Your invoices look good!"
                    : "No alerts match your filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>

      <AcknowledgeDialog
        open={acknowledgeDialogOpen}
        onOpenChange={setAcknowledgeDialogOpen}
        alertTitle={selectedAlert?.title || ""}
        onConfirm={handleConfirmAcknowledge}
        isLoading={isAcknowledging}
      />

      <AlertSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </Layout>
  );
}
