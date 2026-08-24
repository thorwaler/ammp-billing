/** "Still zero — set manually" list of the revision dialog. */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BatteryCharging, EyeOff } from "lucide-react";
import type { StillZeroAsset } from "@/lib/invoiceRevision";
import type { PerContractDiff } from "./useRevisionData";

interface Props {
  perContractDiff: PerContractDiff[];
  isMerged: boolean;
  manualInputs: Record<string, string>;
  batterySourced: Set<string>;
  batteryKWFor: (z: StillZeroAsset) => number | null;
  onManualChange: (assetId: string, value: string) => void;
  onUseBattery: (z: StillZeroAsset) => void;
  isIgnored: (assetId: string) => boolean;
  onToggleIgnored: (assetId: string, assetName: string) => void;
}

export function StillZeroList({
  perContractDiff,
  isMerged,
  manualInputs,
  batterySourced,
  batteryKWFor,
  onManualChange,
  onUseBattery,
  isIgnored,
  onToggleIgnored,
}: Props) {
  return (
    <div className="rounded-md border divide-y">
      {perContractDiff
        .filter((p) => p.diff.stillZero.length > 0)
        .map((p) => (
          <div key={p.contractId}>
            {isMerged && (
              <div className="bg-muted/50 px-2 py-1 text-xs font-medium">
                {p.contractName || p.contractId.slice(0, 8)}
              </div>
            )}
            {p.diff.stillZero.map((z) => {
              const batteryOnly = z.isBatteryOnly === true;
              const batteryKWh = z.batteryCapacityKWh ?? null;
              const batteryKW = batteryKWFor(z);
              const fromBattery = batterySourced.has(z.assetId);
              const batteryText = [
                batteryKW != null ? `battery inverter ${batteryKW.toFixed(0)} kW` : null,
                batteryKWh != null ? `${batteryKWh.toFixed(0)} kWh battery` : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div key={z.assetId} className="flex items-center gap-3 p-2 text-sm">
                  <span className="flex-1 truncate">
                    {z.assetName}
                    {batteryOnly && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Battery-only
                      </Badge>
                    )}
                    {fromBattery && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        manual value (battery)
                      </Badge>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      ID: {z.assetId} ·{" "}
                      {batteryOnly
                        ? "no PV inverter — 0 MWp expected"
                        : z.metric === "kva"
                          ? "no genset rating in AMMP"
                          : "0 MWp in AMMP"}
                      {batteryText ? ` · ${batteryText}` : ""}
                    </span>
                  </span>
                  {batteryKW != null && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs whitespace-nowrap"
                      title={`Bill this site on its battery inverter rating (${batteryKW.toFixed(0)} kW = ${(
                        batteryKW / 1000
                      ).toFixed(3)} MWp)`}
                      onClick={() => onUseBattery(z)}
                    >
                      <BatteryCharging className="h-3 w-3 mr-1" />
                      Use battery
                    </Button>
                  )}
                  <Input
                    type="number"
                    min={0}
                    step={z.metric === "kva" ? 1 : 0.001}
                    value={manualInputs[z.assetId] ?? ""}
                    onChange={(e) => onManualChange(z.assetId, e.target.value)}
                    placeholder={z.metric === "kva" ? "kVA" : "MWp"}
                    className="h-8 w-24"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs whitespace-nowrap"
                    title="Mark this site as not relevant — it stops raising zero-capacity alerts and warnings"
                    onClick={() => onToggleIgnored(z.assetId, z.assetName)}
                  >
                    <EyeOff className="h-3 w-3 mr-1" />
                    {isIgnored(z.assetId) ? "Ignored" : "Ignore"}
                  </Button>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
