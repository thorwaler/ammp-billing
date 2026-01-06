import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronRight, 
  History, 
  AlertTriangle, 
  Plus, 
  Minus, 
  RotateCcw,
  Search,
  Filter
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, startOfDay } from "date-fns";
import { useAssetStatusHistory, type AssetStatusRecord } from "@/hooks/useAssetStatusHistory";
import { Skeleton } from "@/components/ui/skeleton";

interface AssetStatusTimelineProps {
  contractId: string;
  suspiciousThresholdDays?: number;
}

const statusConfig = {
  appeared: {
    icon: Plus,
    color: "text-green-600",
    bgColor: "bg-green-100",
    label: "Appeared",
    description: "New asset detected",
  },
  disappeared: {
    icon: Minus,
    color: "text-red-600",
    bgColor: "bg-red-100",
    label: "Disappeared",
    description: "Asset no longer detected",
  },
  reappeared: {
    icon: RotateCcw,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    label: "Reappeared",
    description: "Asset returned after absence",
  },
};

export function AssetStatusTimeline({ 
  contractId, 
  suspiciousThresholdDays = 30 
}: AssetStatusTimelineProps) {
  const { data: history, isLoading, error } = useAssetStatusHistory(contractId);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // Group events by date
  const groupedHistory = useMemo(() => {
    if (!history) return new Map<string, AssetStatusRecord[]>();

    const filtered = history.filter((record) => {
      const matchesSearch = 
        searchTerm === "" ||
        record.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.asset_id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = 
        filterType === "all" || record.status_change === filterType;
      
      return matchesSearch && matchesType;
    });

    const grouped = new Map<string, AssetStatusRecord[]>();
    
    for (const record of filtered) {
      const dateKey = startOfDay(parseISO(record.detected_at)).toISOString();
      const existing = grouped.get(dateKey) || [];
      grouped.set(dateKey, [...existing, record]);
    }

    return grouped;
  }, [history, searchTerm, filterType]);

  const sortedDates = useMemo(() => {
    return Array.from(groupedHistory.keys()).sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    );
  }, [groupedHistory]);

  const visibleDates = showAll ? sortedDates : sortedDates.slice(0, 5);

  const toggleDay = (dateKey: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const isSuspicious = (record: AssetStatusRecord) => {
    return (
      record.status_change === "reappeared" &&
      record.days_absent !== null &&
      record.days_absent <= suspiciousThresholdDays
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Asset Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Asset Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load asset status history.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Asset Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <History className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No asset status changes recorded yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Changes will appear here after each AMMP sync.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Asset Status History
            <Badge variant="secondary" className="ml-2">
              {history.length} events
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="appeared">Appeared</SelectItem>
              <SelectItem value="disappeared">Disappeared</SelectItem>
              <SelectItem value="reappeared">Reappeared</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          {visibleDates.map((dateKey) => {
            const events = groupedHistory.get(dateKey) || [];
            const date = parseISO(dateKey);
            const isExpanded = expandedDays.has(dateKey);
            const hasSuspicious = events.some(isSuspicious);

            return (
              <Collapsible
                key={dateKey}
                open={isExpanded}
                onOpenChange={() => toggleDay(dateKey)}
              >
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">
                        {format(date, "MMM d, yyyy")}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        ({formatDistanceToNow(date, { addSuffix: true })})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasSuspicious && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Suspicious
                        </Badge>
                      )}
                      <Badge variant="secondary">
                        {events.length} {events.length === 1 ? "change" : "changes"}
                      </Badge>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 ml-4 border-l-2 border-muted pl-4 space-y-2">
                    {events.map((event) => {
                      const config = statusConfig[event.status_change];
                      const Icon = config.icon;
                      const suspicious = isSuspicious(event);

                      return (
                        <div
                          key={event.id}
                          className={`flex items-start gap-3 p-3 rounded-lg ${
                            suspicious ? "bg-amber-50 border border-amber-200" : "bg-card border"
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-full ${config.bgColor} ${config.color}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">
                                {event.asset_name}
                              </span>
                              <Badge variant="outline" className={config.color}>
                                {config.label}
                              </Badge>
                              {suspicious && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Suspicious
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {event.capacity_mw.toFixed(4)} MW
                              {event.days_absent !== null && (
                                <> • Absent for {event.days_absent} days</>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono mt-1">
                              {event.asset_id}
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(parseISO(event.detected_at), "HH:mm")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        {/* Show More/Less */}
        {sortedDates.length > 5 && (
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? `Show less`
                : `Show ${sortedDates.length - 5} more days`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
