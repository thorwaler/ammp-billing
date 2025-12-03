import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format, subMonths, subYears } from "date-fns";
import { cn } from "@/lib/utils";

interface XeroSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSync: (fromDate: string | null) => Promise<void>;
  syncing: boolean;
}

type DateRangeOption = "6months" | "12months" | "2years" | "all" | "custom";

export function XeroSyncDialog({ open, onOpenChange, onSync, syncing }: XeroSyncDialogProps) {
  const [dateRangeOption, setDateRangeOption] = useState<DateRangeOption>("12months");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);

  const getFromDate = (): string | null => {
    const now = new Date();
    switch (dateRangeOption) {
      case "6months":
        return subMonths(now, 6).toISOString().split('T')[0];
      case "12months":
        return subMonths(now, 12).toISOString().split('T')[0];
      case "2years":
        return subYears(now, 2).toISOString().split('T')[0];
      case "all":
        return null;
      case "custom":
        return customDate ? customDate.toISOString().split('T')[0] : null;
      default:
        return subMonths(now, 12).toISOString().split('T')[0];
    }
  };

  const handleSync = async () => {
    const fromDate = getFromDate();
    await onSync(fromDate);
  };

  const getDateRangeDescription = (): string => {
    const fromDate = getFromDate();
    if (!fromDate) return "All invoices from the beginning";
    return `Invoices from ${format(new Date(fromDate), 'MMM dd, yyyy')} onwards`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sync Invoices from Xero</DialogTitle>
          <DialogDescription>
            Choose how far back to sync invoices. Only new invoices not already in the system will be imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Date Range</Label>
            <Select value={dateRangeOption} onValueChange={(v) => setDateRangeOption(v as DateRangeOption)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6months">Last 6 months</SelectItem>
                <SelectItem value="12months">Last 12 months</SelectItem>
                <SelectItem value="2years">Last 2 years</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dateRangeOption === "custom" && (
            <div className="space-y-2">
              <Label>From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !customDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDate ? format(customDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={setCustomDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {getDateRangeDescription()}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
            Cancel
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              "Sync Invoices"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
