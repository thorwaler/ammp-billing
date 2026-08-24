/** "Sites now reporting capacity" list of the revision dialog. */

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ZeroMwCorrection } from "@/lib/invoiceRevision";

interface Props {
  corrections: ZeroMwCorrection[];
  selectedIds: string[];
  manualInputs: Record<string, string>;
  hasManualOverride: (assetId: string) => boolean;
  onToggle: (assetId: string) => void;
  onManualChange: (assetId: string, value: string) => void;
}

export function CorrectionsList({
  corrections,
  selectedIds,
  manualInputs,
  hasManualOverride,
  onToggle,
  onManualChange,
}: Props) {
  if (corrections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-md border p-3">
        No frozen site without capacity (0 MWp or no genset rating) reports a value in the current data. Use the
        manual section below if you need to price one anyway.
      </p>
    );
  }

  return (
    <div className="rounded-md border divide-y">
      {corrections.map((c) => (
        <div key={c.assetId} className="flex items-center gap-3 p-2 text-sm">
          <Checkbox checked={selectedIds.includes(c.assetId)} onCheckedChange={() => onToggle(c.assetId)} />
          <span className="flex-1 truncate">
            {c.assetName}
            <span className="block text-xs text-muted-foreground">ID: {c.assetId}</span>
            {c.metric === "kva" && c.ratingUnknownAtFreeze && (
              <span className="block text-xs text-muted-foreground">rating unknown at freeze</span>
            )}
            {hasManualOverride(c.assetId) && (
              <span className="block text-xs text-primary">manual value overrides the sync</span>
            )}
          </span>
          <span className="text-muted-foreground whitespace-nowrap">
            {c.metric === "kva"
              ? `${c.previousKVA ?? 0} → ${Number(c.newKVA || 0).toLocaleString()} kVA`
              : `0 MW → ${c.newMW.toFixed(3)} MW`}
          </span>
          <Input
            type="number"
            min={0}
            step={c.metric === "kva" ? 1 : 0.001}
            value={manualInputs[c.assetId] ?? ""}
            onChange={(e) => onManualChange(c.assetId, e.target.value)}
            placeholder={c.metric === "kva" ? "kVA" : "MWp"}
            className="h-8 w-24"
          />
        </div>
      ))}
    </div>
  );
}
