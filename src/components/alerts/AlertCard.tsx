import { useState } from "react";
import { AlertTriangle, AlertCircle, Info, Check, ExternalLink, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { InvoiceAlertRecord } from "@/hooks/useInvoiceAlerts";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const formatScalar = (v: unknown): string =>
  typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(v);

const humanKey = (k: string) => k.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

const isIdKey = (k: string) => /id$/i.test(k);

function recordLabel(rec: Record<string, unknown>): string {
  for (const k of ["assetName", "orgName", "name", "title", "label"]) {
    if (typeof rec[k] === "string" && rec[k]) return rec[k] as string;
  }
  const entry = Object.entries(rec).find(([k, v]) => !isIdKey(k) && v != null);
  return entry ? `${humanKey(entry[0])}: ${formatScalar(entry[1])}` : "(unnamed)";
}

function recordSecondary(rec: Record<string, unknown>, usedLabelKey?: string): string {
  return Object.entries(rec)
    .filter(
      ([k, v]) =>
        !isIdKey(k) &&
        k !== usedLabelKey &&
        v != null &&
        (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    )
    .map(([k, v]) => `${humanKey(k)}: ${formatScalar(v)}`)
    .join(" · ");
}

function DetailList({ items }: { items: unknown[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 10);

  return (
    <div className="space-y-1">
      {visible.map((item, i) => {
        if (!isPlainObject(item)) {
          return (
            <div key={i} className="font-medium">
              {formatScalar(item)}
            </div>
          );
        }
        const labelKey = ["assetName", "orgName", "name", "title", "label"].find(
          (k) => typeof item[k] === "string" && item[k]
        );
        const secondary = recordSecondary(item, labelKey);
        return (
          <div key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{recordLabel(item)}</span>
            {secondary && <span className="text-muted-foreground">{secondary}</span>}
          </div>
        );
      })}
      {items.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function DetailEntry({ entryKey, value }: { entryKey: string; value: unknown }) {
  const label = <span className="text-muted-foreground">{humanKey(entryKey)}: </span>;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div>
          {label}
          <span className="font-medium">none</span>
        </div>
      );
    }
    return (
      <div className="col-span-2">
        <div className="text-muted-foreground mb-1">
          {humanKey(entryKey)} ({value.length})
        </div>
        <DetailList items={value} />
      </div>
    );
  }

  if (isPlainObject(value)) {
    return (
      <div className="col-span-2">
        <div className="text-muted-foreground mb-1">{humanKey(entryKey)}</div>
        <div className="space-y-0.5">
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{humanKey(k)}: </span>
              <span className="font-medium">
                {isPlainObject(v) || Array.isArray(v) ? JSON.stringify(v) : formatScalar(v)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {label}
      <span className="font-medium">{formatScalar(value)}</span>
    </div>
  );
}


interface AlertCardProps {
  alert: InvoiceAlertRecord;
  onAcknowledge: (alertId: string) => void;
  onDelete: (alertId: string) => void;
}

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
    badgeVariant: "destructive" as const,
  },
  warning: {
    icon: AlertCircle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    badgeVariant: "default" as const,
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    badgeVariant: "secondary" as const,
  },
};

const alertTypeLabels: Record<string, string> = {
  invoice_increase: "Invoice Increase",
  mw_decrease: "MW Decrease",
  site_decrease: "Site Count Decrease",
  asset_disappeared: "Asset Disappeared",
  asset_reappeared: "Asset Reappeared",
  asset_disappeared_individual: "Asset Disappeared",
  asset_reappeared_suspicious: "Suspicious Asset Return",
  zero_pv_capacity: "Zero PV Capacity",
  elum_org_unassigned: "Elum Sub-org Without Tier",
  elum_asset_double_count: "Elum Asset Double Count",
  elum_utility_site_too_small: "Elum Utility Site < 2 MWp",
  elum_combined_minimum_shortfall: "Elum Combined Minimum Shortfall",
};

export function AlertCard({ alert, onAcknowledge, onDelete }: AlertCardProps) {
  const config = severityConfig[alert.severity] || severityConfig.info;
  const Icon = config.icon;

  const customerName = alert.customer?.nickname || alert.customer?.name || "Unknown Customer";

  return (
    <Card className={`${config.bgColor} ${config.borderColor} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${config.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={config.badgeVariant} className="uppercase text-xs">
                  {alert.severity}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {alertTypeLabels[alert.alert_type] || alert.alert_type}
                </Badge>
                {alert.is_acknowledged && (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Acknowledged
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base mt-2">{alert.title}</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {customerName}
              </CardDescription>
            </div>
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(alert.created_at), "MMM d, yyyy HH:mm")}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{alert.description}</p>
        
        {alert.metadata && Object.keys(alert.metadata).length > 0 && (
          <div className="bg-muted/50 rounded-md p-3 mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Details</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(alert.metadata).map(([key, value]) => (
                <div key={key}>
                  <span className="text-muted-foreground">{key.replace(/_/g, ' ')}: </span>
                  <span className="font-medium">
                    {typeof value === 'number' 
                      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : String(value)
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {alert.is_acknowledged && alert.acknowledgment_note && (
          <div className="bg-muted/50 rounded-md p-3 mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Acknowledgment Note</p>
            <p className="text-sm">{alert.acknowledgment_note}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2">
            {alert.customer_id && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/customers/${alert.customer_id}`}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Customer
                </Link>
              </Button>
            )}
            {alert.contract_id && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/contracts/${alert.contract_id}`}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Contract
                </Link>
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            {!alert.is_acknowledged && (
              <Button 
                variant="default" 
                size="sm"
                onClick={() => onAcknowledge(alert.id)}
              >
                <Check className="h-3 w-3 mr-1" />
                Acknowledge
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onDelete(alert.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
