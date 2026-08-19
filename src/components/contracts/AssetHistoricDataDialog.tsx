import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface HistoricPoint {
  t: number;
  kW: number;
}

interface DeviceRow {
  deviceId: string;
  deviceName: string;
  peakKW: number | null;
  points: number;
  error?: string;
}

interface SliceResponse {
  ok: boolean;
  assetName?: string;
  granularity?: 'raw' | 'daily';
  interval?: string;
  registeredKWp?: number;
  peakKW?: number | null;
  points?: HistoricPoint[];
  perDevice?: DeviceRow[];
  isBatteryOnly?: boolean;
  batteryCapacityKWh?: number | null;
  truncated?: boolean;
  reason?: string | null;
  error?: string;
}

const DAY_MS = 86_400_000;
const SLICE_DAYS = 30;

const WINDOWS: Array<{ days: number; label: string; granularity: 'raw' | 'daily' }> = [
  { days: 7, label: 'Last 7 days', granularity: 'raw' },
  { days: 30, label: 'Last 30 days', granularity: 'raw' },
  { days: 90, label: 'Last 90 days', granularity: 'daily' },
  { days: 365, label: 'Last 12 months', granularity: 'daily' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  asset: { assetId: string; assetName?: string } | null;
}

interface AggregateState {
  points: HistoricPoint[];
  perDevice: DeviceRow[];
  registeredKWp: number;
  peakKW: number | null;
  ratio: number | null;
  granularity: 'raw' | 'daily';
  interval?: string;
  isBatteryOnly: boolean;
  batteryCapacityKWh: number | null;
  reason?: string | null;
  sliceErrors: string[];
  truncated: boolean;
}

/** Trailing slices of at most SLICE_DAYS covering the window, oldest first. */
function buildSlices(windowDays: number): Array<{ from: string; to: string }> {
  const end = Date.now();
  const start = end - windowDays * DAY_MS;
  const slices: Array<{ from: string; to: string }> = [];
  for (let s = start; s < end; s += SLICE_DAYS * DAY_MS) {
    slices.push({
      from: new Date(s).toISOString(),
      to: new Date(Math.min(s + SLICE_DAYS * DAY_MS, end)).toISOString(),
    });
  }
  return slices;
}

export function AssetHistoricDataDialog({ open, onOpenChange, contractId, asset }: Props) {
  const [windowDays, setWindowDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [data, setData] = useState<AggregateState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setProgress(null);
      setWindowDays(7);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !asset?.assetId) return;
    let cancelled = false;

    const granularity = WINDOWS.find((w) => w.days === windowDays)?.granularity ?? 'raw';
    const slices = buildSlices(windowDays);

    const load = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      setProgress({ done: 0, total: slices.length });

      const pointsByTs = new Map<number, number>();
      const deviceMap = new Map<string, DeviceRow>();
      const sliceErrors: string[] = [];
      let registeredKWp = 0;
      let isBatteryOnly = false;
      let batteryCapacityKWh: number | null = null;
      let reason: string | null | undefined = null;
      let interval: string | undefined;
      let truncated = false;
      let anySuccess = false;

      for (let i = 0; i < slices.length; i++) {
        if (cancelled) return;
        try {
          const { data: res, error: fnError } = await supabase.functions.invoke(
            'ammp-asset-historic-data',
            {
              body: {
                contractId,
                assetId: asset.assetId,
                dateFrom: slices[i].from,
                dateTo: slices[i].to,
                granularity,
              },
            },
          );
          if (cancelled) return;
          if (fnError) throw new Error(fnError.message);
          const slice = res as SliceResponse;
          if (!slice?.ok) throw new Error(slice?.error || 'Failed to load historic data');

          anySuccess = true;
          interval = slice.interval ?? interval;
          registeredKWp = slice.registeredKWp ?? registeredKWp;
          isBatteryOnly = slice.isBatteryOnly === true || isBatteryOnly;
          if (slice.batteryCapacityKWh != null) batteryCapacityKWh = slice.batteryCapacityKWh;
          if (slice.truncated) truncated = true;
          if (slice.reason === 'no_pv_inverters') reason = 'no_pv_inverters';

          for (const p of slice.points ?? []) {
            const prev = pointsByTs.get(p.t);
            if (prev == null || p.kW > prev) pointsByTs.set(p.t, p.kW);
          }
          for (const d of slice.perDevice ?? []) {
            const prev = deviceMap.get(d.deviceId);
            deviceMap.set(d.deviceId, {
              deviceId: d.deviceId,
              deviceName: d.deviceName,
              peakKW: Math.max(prev?.peakKW ?? 0, d.peakKW ?? 0) || (prev?.peakKW ?? d.peakKW ?? null),
              points: (prev?.points ?? 0) + d.points,
              error: d.error ?? prev?.error,
            });
          }
        } catch (err) {
          sliceErrors.push(err instanceof Error ? err.message : String(err));
        }

        if (cancelled) return;
        setProgress({ done: i + 1, total: slices.length });

        const points = [...pointsByTs.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([t, kW]) => ({ t, kW }));
        const peakKW = points.length > 0 ? Math.max(...points.map((p) => p.kW)) : null;
        setData({
          points,
          perDevice: [...deviceMap.values()],
          registeredKWp,
          peakKW,
          ratio: peakKW != null && registeredKWp > 0 ? peakKW / registeredKWp : null,
          granularity,
          interval,
          isBatteryOnly,
          batteryCapacityKWh,
          reason: points.length === 0 ? (reason ?? (sliceErrors.length ? 'error' : 'no_data')) : null,
          sliceErrors,
          truncated,
        });
      }

      if (!cancelled) {
        if (!anySuccess && sliceErrors.length > 0) setError(sliceErrors[0]);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, asset?.assetId, contractId, windowDays]);

  const points = data?.points ?? [];
  const isDaily = data?.granularity === 'daily';
  const chartData = points.map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleString(
      undefined,
      isDaily
        ? { day: '2-digit', month: 'short', year: '2-digit' }
        : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
    ),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{asset?.assetName || 'Historic data'}</DialogTitle>
          <DialogDescription>
            PV AC power measured in AMMP, summed across the site's PV inverters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w.days}
              size="sm"
              variant={windowDays === w.days ? 'default' : 'outline'}
              onClick={() => setWindowDays(w.days)}
              disabled={loading}
            >
              {w.label}
            </Button>
          ))}
          {loading && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress && progress.total > 1
                ? `loaded ${progress.done} of ${progress.total} slices`
                : 'loading'}
            </span>
          )}
        </div>

        {data && (
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Observed peak</div>
              <div className="font-medium">
                {data.peakKW != null ? `${data.peakKW.toFixed(1)} kW` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Registered</div>
              <div className="font-medium">
                {data.registeredKWp ? `${data.registeredKWp.toFixed(1)} kWp` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Ratio</div>
              <div className="font-medium">{data.ratio != null ? data.ratio.toFixed(2) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Resolution</div>
              <div className="font-medium">{isDaily ? 'daily peak' : (data.interval ?? '—')}</div>
            </div>
            {data.isBatteryOnly && (
              <Badge variant="outline" className="self-center">
                Battery-only
                {data.batteryCapacityKWh != null ? ` · ${Number(data.batteryCapacityKWh).toFixed(0)} kWh` : ''}
              </Badge>
            )}
          </div>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}

        {!error && data && data.sliceErrors.length > 0 && points.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {data.sliceErrors.length} time slice(s) failed — showing partial data. First error:{' '}
            {data.sliceErrors[0]}
          </div>
        )}

        {data?.truncated && (
          <div className="text-xs text-muted-foreground">
            AMMP is slow for this site, so some slices were cut short — the series may be incomplete.
          </div>
        )}

        {!loading && !error && data && points.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {data.reason === 'no_pv_inverters'
              ? 'This site has no PV inverters registered in AMMP, so there is no PV series to show.'
              : data.reason === 'error'
                ? `AMMP request failed: ${data.sliceErrors[0]}`
                : 'AMMP returned no data for this window.'}
            {data.isBatteryOnly && ' This is a battery-only site, so PV data is not expected.'}
          </div>
        )}

        {points.length > 0 && (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  unit=" kW"
                  width={64}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [
                    `${Number(value).toFixed(2)} kW`,
                    isDaily ? 'Daily peak AC power' : 'AC power',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="kW"
                  stroke="hsl(var(--primary))"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {isDaily && points.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Long windows are aggregated: each point is the highest 15-minute AC power measured that day.
          </div>
        )}

        {data?.perDevice && data.perDevice.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Device</th>
                  <th className="text-right p-2 font-medium">Peak (kW)</th>
                  <th className="text-right p-2 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.perDevice.map((d) => (
                  <tr key={d.deviceId} className="border-t">
                    <td className="p-2">
                      {d.deviceName}
                      {d.error && <div className="text-xs text-destructive">{d.error}</div>}
                    </td>
                    <td className="p-2 text-right">{d.peakKW != null ? d.peakKW.toFixed(2) : '—'}</td>
                    <td className="p-2 text-right">{d.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
