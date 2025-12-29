import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface AlertFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: "all" | "unacknowledged" | "acknowledged";
  onStatusFilterChange: (value: "all" | "unacknowledged" | "acknowledged") => void;
  severityFilter: "all" | "critical" | "warning" | "info";
  onSeverityFilterChange: (value: "all" | "critical" | "warning" | "info") => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
}

const alertTypes = [
  { value: "all", label: "All Types" },
  { value: "invoice_increase", label: "Invoice Increase" },
  { value: "mw_decrease", label: "MW Decrease" },
  { value: "site_decrease", label: "Site Decrease" },
  { value: "asset_disappeared", label: "Asset Disappeared" },
  { value: "asset_reappeared", label: "Asset Reappeared" },
];

export function AlertFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  severityFilter,
  onSeverityFilterChange,
  typeFilter,
  onTypeFilterChange,
}: AlertFiltersProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onStatusFilterChange("all")}
          >
            All
          </Button>
          <Button
            variant={statusFilter === "unacknowledged" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onStatusFilterChange("unacknowledged")}
          >
            Unacknowledged
          </Button>
          <Button
            variant={statusFilter === "acknowledged" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onStatusFilterChange("acknowledged")}
          >
            Acknowledged
          </Button>
        </div>

        <Select value={severityFilter} onValueChange={onSeverityFilterChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={onTypeFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alert Type" />
          </SelectTrigger>
          <SelectContent>
            {alertTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
