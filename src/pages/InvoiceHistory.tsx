import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { InvoiceDetailsDialog } from "@/components/invoices/InvoiceDetailsDialog";
import { SupportDocumentDownloadDialog } from "@/components/invoices/SupportDocumentDownloadDialog";
import { XeroSyncDialog } from "@/components/invoices/XeroSyncDialog";
import { SupportDocumentData } from "@/lib/supportDocumentGenerator";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2, Eye, ExternalLink, Filter, FileText, RefreshCw } from "lucide-react";

interface Invoice {
  id: string;
  invoice_date: string;
  customer_id: string;
  contract_id: string | null;
  invoice_amount: number;
  invoice_amount_eur: number | null;
  billing_frequency: string;
  xero_invoice_id: string | null;
  currency: string;
  mw_managed: number;
  total_mw: number;
  mw_change: number;
  modules_data: any;
  addons_data: any;
  support_document_data: SupportDocumentData | null;
  source: string;
  arr_amount: number;
  arr_amount_eur: number | null;
  nrr_amount: number;
  nrr_amount_eur: number | null;
  xero_reference: string | null;
  xero_status: string | null;
  xero_contact_name: string | null;
  customer: {
    name: string;
  } | null;
}

export default function InvoiceHistory() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [xeroFilter, setXeroFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchInvoices();
    }
  }, [user]);

  useEffect(() => {
    filterInvoices();
  }, [searchQuery, xeroFilter, sourceFilter, invoices]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(name)
        `)
        .eq('user_id', user?.id)
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      setInvoices((data || []) as unknown as Invoice[]);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoice history');
    } finally {
      setLoading(false);
    }
  };

  const filterInvoices = () => {
    let filtered = [...invoices];

    if (searchQuery) {
      filtered = filtered.filter(inv => {
        const customerName = inv.customer?.name || inv.xero_contact_name || '';
        return customerName.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    if (xeroFilter !== "all") {
      filtered = filtered.filter(inv => 
        xeroFilter === "sent" ? inv.xero_invoice_id : !inv.xero_invoice_id
      );
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter(inv => inv.source === sourceFilter);
    }

    setFilteredInvoices(filtered);
  };

  const handleSyncFromXero = async (fromDate: string | null) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('xero-sync-invoices', {
        body: { fromDate }
      });
      
      if (error) throw error;
      
      toast.success(`Synced ${data.syncedCount} new invoices from Xero`);
      fetchInvoices();
      setSyncDialogOpen(false);
    } catch (error: any) {
      console.error('Error syncing from Xero:', error);
      toast.error(error.message || 'Failed to sync from Xero');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadSupportDoc = (invoice: Invoice) => {
    if (!invoice.support_document_data) {
      toast.error("No support document available for this invoice");
      return;
    }
    setSelectedInvoice(invoice);
    setDownloadDialogOpen(true);
  };

  const handleDeleteInvoice = async () => {
    if (!selectedInvoice) return;

    try {
      // Get invoice details before deletion
      const invoiceDate = new Date(selectedInvoice.invoice_date);
      const contractId = selectedInvoice.contract_id;
      const billingFrequency = selectedInvoice.billing_frequency;

      // Delete the invoice
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', selectedInvoice.id);

      if (error) throw error;

      // Roll back the contract's next_invoice_date if we have a contract_id
      if (contractId) {
        // Calculate the period end (day before invoice date)
        const periodEnd = new Date(invoiceDate);
        periodEnd.setDate(periodEnd.getDate() - 1);
        
        // Calculate the previous period start based on billing frequency
        let previousPeriodStart = new Date(periodEnd);
        switch (billingFrequency) {
          case 'monthly':
            previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
            previousPeriodStart.setDate(previousPeriodStart.getDate() + 1);
            break;
          case 'quarterly':
            previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 3);
            previousPeriodStart.setDate(previousPeriodStart.getDate() + 1);
            break;
          case 'biannual':
            previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 6);
            previousPeriodStart.setDate(previousPeriodStart.getDate() + 1);
            break;
          case 'annual':
            previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
            previousPeriodStart.setDate(previousPeriodStart.getDate() + 1);
            break;
        }

        const { error: updateError } = await supabase
          .from('contracts')
          .update({
            next_invoice_date: invoiceDate.toISOString(),
            period_start: previousPeriodStart.toISOString(),
            period_end: periodEnd.toISOString()
          })
          .eq('id', contractId);

        if (updateError) {
          console.error('Error updating contract:', updateError);
          toast.warning('Invoice deleted but contract dates may not have been updated');
        } else {
          toast.success('Invoice deleted - contract will reappear in upcoming invoices');
        }
      } else {
        toast.success('Invoice deleted successfully');
      }

      fetchInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
    } finally {
      setDeleteDialogOpen(false);
      setSelectedInvoice(null);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount);
  };

  // Calculate totals using EUR amounts for accurate currency-agnostic totals
  const totalARR = filteredInvoices.reduce((sum, inv) => sum + (inv.arr_amount_eur ?? inv.arr_amount ?? 0), 0);
  const totalNRR = filteredInvoices.reduce((sum, inv) => sum + (inv.nrr_amount_eur ?? inv.nrr_amount ?? 0), 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Invoice History</h1>
            <p className="text-muted-foreground">View and manage all your invoices</p>
          </div>
          <Button onClick={() => setSyncDialogOpen(true)} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync from Xero
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(totalARR + totalNRR, 'EUR')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">ARR (Platform Fees)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totalARR, 'EUR')}</p>
              <p className="text-xs text-muted-foreground">
                {totalARR + totalNRR > 0 ? ((totalARR / (totalARR + totalNRR)) * 100).toFixed(1) : 0}% of total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">NRR (Implementation)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-500">{formatCurrency(totalNRR, 'EUR')}</p>
              <p className="text-xs text-muted-foreground">
                {totalARR + totalNRR > 0 ? ((totalNRR / (totalARR + totalNRR)) * 100).toFixed(1) : 0}% of total
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <CardTitle>All Invoices</CardTitle>
                <CardDescription>
                  {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} found
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-48"
                />
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="xero">Xero</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={xeroFilter} onValueChange={setXeroFilter}>
                  <SelectTrigger className="w-[140px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="sent">Sent to Xero</SelectItem>
                    <SelectItem value="not-sent">Not Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No invoices found</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">ARR</TableHead>
                      <TableHead className="text-right">NRR</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {invoice.customer?.name || invoice.xero_contact_name || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={invoice.source === 'xero' ? 'secondary' : 'outline'}>
                            {invoice.source === 'xero' ? 'Xero' : 'Internal'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(invoice.invoice_amount, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right text-primary">
                          {formatCurrency(invoice.arr_amount || 0, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right text-orange-500">
                          {formatCurrency(invoice.nrr_amount || 0, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          {invoice.xero_invoice_id ? (
                            <Badge variant="default" className="flex items-center gap-1 w-fit">
                              {invoice.xero_status || 'Sent'}
                              <a 
                                href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.xero_invoice_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Not Sent</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadSupportDoc(invoice)}
                              disabled={!invoice.support_document_data}
                              title={invoice.support_document_data ? "Download Support Document" : "No support document"}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setDetailsDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to delete this invoice from the local database?</p>
              {selectedInvoice?.xero_invoice_id && (
                <p className="text-warning font-medium">
                  ⚠️ This invoice was sent to Xero (ID: {selectedInvoice.xero_invoice_id}). 
                  Deleting here won't remove it from Xero. You'll need to void/delete it in Xero separately.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedInvoice && (
        <>
          <InvoiceDetailsDialog
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
            invoice={selectedInvoice}
          />
          
          {selectedInvoice.support_document_data && (
            <SupportDocumentDownloadDialog
              open={downloadDialogOpen}
              onOpenChange={setDownloadDialogOpen}
              documentData={selectedInvoice.support_document_data}
              customerName={selectedInvoice.customer?.name || selectedInvoice.xero_contact_name || 'Unknown'}
              invoicePeriod={format(new Date(selectedInvoice.invoice_date), 'MMM yyyy')}
            />
          )}
        </>
      )}

      <XeroSyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onSync={handleSyncFromXero}
        syncing={syncing}
      />
    </Layout>
  );
}
