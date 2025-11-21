import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FileText, ChevronDown, ChevronUp, Download } from "lucide-react";

interface Amendment {
  id: string;
  amendment_number: number;
  amendment_date: string;
  effective_date: string | null;
  pdf_url: string | null;
  ocr_data: any;
  ocr_status: string;
  changes_summary: string | null;
}

interface AmendmentTimelineProps {
  amendments: Amendment[];
  originalContract: {
    signed_date: string | null;
    contract_pdf_url: string | null;
  };
}

export default function AmendmentTimeline({
  amendments,
  originalContract,
}: AmendmentTimelineProps) {
  const [expandedAmendments, setExpandedAmendments] = useState<Set<string>>(
    new Set()
  );

  const toggleExpanded = (id: string) => {
    setExpandedAmendments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      completed: "default",
      manual: "default",
      uploaded: "default",
      processing: "secondary",
      failed: "destructive",
      pending: "secondary",
    };
    return (
      <Badge variant={variants[status] || "secondary"} className="capitalize">
        {status}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM dd, yyyy");
  };

  const sortedAmendments = [...amendments].sort(
    (a, b) => b.amendment_number - a.amendment_number
  );

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-8">
        {/* Amendments */}
        {sortedAmendments.map((amendment, index) => (
          <div key={amendment.id} className="relative pl-12">
            {/* Timeline node */}
            <div
              className={`
              absolute left-0 w-8 h-8 rounded-full border-4 border-background
              flex items-center justify-center
              ${
                amendment.ocr_status === "completed"
                  ? "bg-primary"
                  : amendment.ocr_status === "processing"
                  ? "bg-secondary animate-pulse"
                  : amendment.ocr_status === "failed"
                  ? "bg-destructive"
                  : "bg-muted"
              }
            `}
            >
              <span className="text-xs font-bold text-primary-foreground">
                {amendment.amendment_number}
              </span>
            </div>

            <Card>
              <CardContent className="pt-6">
                <Collapsible
                  open={expandedAmendments.has(amendment.id)}
                  onOpenChange={() => toggleExpanded(amendment.id)}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold">
                          Amendment #{amendment.amendment_number}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatDate(amendment.amendment_date)}</span>
                          {amendment.effective_date && (
                            <>
                              <span>•</span>
                              <span>
                                Effective: {formatDate(amendment.effective_date)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(amendment.ocr_status)}
                        {amendment.pdf_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="h-8 w-8"
                          >
                            <a
                              href={amendment.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {amendment.changes_summary && (
                      <div className="rounded-lg bg-accent/50 p-3 border border-border">
                        <p className="text-sm font-medium mb-1">Key Changes:</p>
                        <p className="text-sm text-muted-foreground">
                          {amendment.changes_summary}
                        </p>
                      </div>
                    )}

                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full">
                        {expandedAmendments.has(amendment.id) ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-2" />
                            Hide details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-2" />
                            Show details
                          </>
                        )}
                      </Button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      {amendment.ocr_data &&
                        Object.keys(amendment.ocr_data).length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-border pt-4">
                            <p className="text-sm font-medium">
                              Extracted Data:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {Object.entries(amendment.ocr_data).map(
                                ([key, value]) => (
                                  <div key={key} className="space-y-1">
                                    <p className="text-muted-foreground capitalize">
                                      {key.replace(/_/g, " ")}:
                                    </p>
                                    <p className="font-medium">
                                      {typeof value === "object"
                                        ? JSON.stringify(value)
                                        : String(value)}
                                    </p>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </CardContent>
            </Card>
          </div>
        ))}

        {/* Original Contract */}
        <div className="relative pl-12">
          {/* Timeline node */}
          <div className="absolute left-0 w-8 h-8 rounded-full border-4 border-background bg-green-500 flex items-center justify-center">
            <FileText className="h-4 w-4 text-white" />
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">
                      Original Contract
                    </h3>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(originalContract.signed_date)}
                    </div>
                  </div>
                  {originalContract.contract_pdf_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-8 w-8"
                    >
                      <a
                        href={originalContract.contract_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
