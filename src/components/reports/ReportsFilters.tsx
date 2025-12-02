import { useState } from "react";
import { format, subDays, subMonths, subYears, startOfYear } from "date-fns";
import { CalendarIcon, Filter, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  customerIds?: string[];
}

interface Customer {
  id: string;
  name: string;
}

interface ReportsFiltersProps {
  customers: Customer[];
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  isLoading?: boolean;
}

type TimePreset = "all" | "30d" | "90d" | "6m" | "1y" | "ytd" | "custom";

const TIME_PRESETS: { value: TimePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "6m", label: "Last 6 Months" },
  { value: "1y", label: "Last Year" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Range" },
];

export function ReportsFilters({
  customers,
  filters,
  onFiltersChange,
  isLoading,
}: ReportsFiltersProps) {
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [customStartOpen, setCustomStartOpen] = useState(false);
  const [customEndOpen, setCustomEndOpen] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

  const handleTimePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined = now;

    switch (preset) {
      case "all":
        startDate = undefined;
        endDate = undefined;
        break;
      case "30d":
        startDate = subDays(now, 30);
        break;
      case "90d":
        startDate = subDays(now, 90);
        break;
      case "6m":
        startDate = subMonths(now, 6);
        break;
      case "1y":
        startDate = subYears(now, 1);
        break;
      case "ytd":
        startDate = startOfYear(now);
        break;
      case "custom":
        // Keep current dates or set defaults
        return;
    }

    onFiltersChange({ ...filters, startDate, endDate });
  };

  const handleCustomDateChange = (
    type: "start" | "end",
    date: Date | undefined
  ) => {
    if (type === "start") {
      onFiltersChange({ ...filters, startDate: date });
      setCustomStartOpen(false);
    } else {
      onFiltersChange({ ...filters, endDate: date });
      setCustomEndOpen(false);
    }
  };

  const handleCustomerToggle = (customerId: string) => {
    const currentIds = filters.customerIds || [];
    const newIds = currentIds.includes(customerId)
      ? currentIds.filter((id) => id !== customerId)
      : [...currentIds, customerId];
    onFiltersChange({ ...filters, customerIds: newIds.length > 0 ? newIds : undefined });
  };

  const handleSelectAllCustomers = () => {
    if (filters.customerIds?.length === customers.length) {
      onFiltersChange({ ...filters, customerIds: undefined });
    } else {
      onFiltersChange({ ...filters, customerIds: customers.map((c) => c.id) });
    }
  };

  const handleClearCustomers = () => {
    onFiltersChange({ ...filters, customerIds: undefined });
  };

  const selectedCustomerCount = filters.customerIds?.length || 0;
  const customerLabel =
    selectedCustomerCount === 0
      ? "All Customers"
      : selectedCustomerCount === 1
      ? customers.find((c) => c.id === filters.customerIds?.[0])?.name || "1 customer"
      : `${selectedCustomerCount} customers`;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="font-medium">Filters:</span>
      </div>

      {/* Time Frame Selector */}
      <div className="flex items-center gap-2">
        <Select
          value={timePreset}
          onValueChange={(v) => handleTimePresetChange(v as TimePreset)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[150px] bg-background">
            <SelectValue placeholder="Time frame" />
          </SelectTrigger>
          <SelectContent>
            {TIME_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Custom Date Range Pickers */}
        {timePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Popover open={customStartOpen} onOpenChange={setCustomStartOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[130px] justify-start text-left font-normal bg-background",
                    !filters.startDate && "text-muted-foreground"
                  )}
                  disabled={isLoading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.startDate
                    ? format(filters.startDate, "MMM d, yyyy")
                    : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.startDate}
                  onSelect={(d) => handleCustomDateChange("start", d)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <span className="text-muted-foreground">to</span>

            <Popover open={customEndOpen} onOpenChange={setCustomEndOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[130px] justify-start text-left font-normal bg-background",
                    !filters.endDate && "text-muted-foreground"
                  )}
                  disabled={isLoading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.endDate
                    ? format(filters.endDate, "MMM d, yyyy")
                    : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.endDate}
                  onSelect={(d) => handleCustomDateChange("end", d)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Customer Multi-Select */}
      <Popover open={customerDropdownOpen} onOpenChange={setCustomerDropdownOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="min-w-[160px] justify-between bg-background"
            disabled={isLoading || customers.length === 0}
          >
            <span className="truncate">{customerLabel}</span>
            {selectedCustomerCount > 0 && (
              <span className="ml-2 rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                {selectedCustomerCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <div className="p-2 border-b flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={handleSelectAllCustomers}
            >
              {filters.customerIds?.length === customers.length ? "Deselect All" : "Select All"}
            </Button>
            {selectedCustomerCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleClearCustomers}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
          <ScrollArea className="h-[200px]">
            <div className="p-2 space-y-1">
              {customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center space-x-2 p-2 rounded hover:bg-muted cursor-pointer"
                  onClick={() => handleCustomerToggle(customer.id)}
                >
                  <Checkbox
                    checked={filters.customerIds?.includes(customer.id) || false}
                    onCheckedChange={() => handleCustomerToggle(customer.id)}
                  />
                  <span className="text-sm truncate flex-1">{customer.name}</span>
                  {filters.customerIds?.includes(customer.id) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
              ))}
              {customers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No customers found
                </p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Clear All Filters */}
      {(filters.startDate || filters.endDate || filters.customerIds) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setTimePreset("all");
            onFiltersChange({});
          }}
          disabled={isLoading}
        >
          <X className="h-4 w-4 mr-1" />
          Clear All
        </Button>
      )}
    </div>
  );
}
