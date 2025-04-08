
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink, BarChart } from "lucide-react";

interface CustomerCardProps {
  name: string;
  location: string;
  contractValue: string;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  addOns: string[];
}

export function CustomerCard({
  name,
  location,
  contractValue,
  mwpManaged,
  status,
  addOns,
}: CustomerCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{name}</CardTitle>
          <Badge
            variant={
              status === "active"
                ? "default"
                : status === "pending"
                ? "outline"
                : "secondary"
            }
          >
            {status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{location}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Contract Value</div>
            <div className="font-medium">{contractValue}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">MWp Managed</div>
            <div className="font-medium">{mwpManaged} MWp</div>
          </div>
          {addOns.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Add-ons</div>
              <div className="flex flex-wrap gap-1">
                {addOns.map((addon) => (
                  <Badge key={addon} variant="outline" className="text-xs">
                    {addon}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" className="w-full">
              <FileText className="mr-2 h-4 w-4" />
              Contract
            </Button>
            <Button size="sm" variant="outline" className="w-full">
              <BarChart className="mr-2 h-4 w-4" />
              Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CustomerCard;
