import { AlertTriangle, AlertCircle, Info, Check, ExternalLink, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { InvoiceAlertRecord } from "@/hooks/useInvoiceAlerts";

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
