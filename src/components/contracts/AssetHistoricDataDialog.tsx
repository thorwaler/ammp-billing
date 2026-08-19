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

interface HistoricResponse {
  ok: boolean;
  assetName?: string;
  windowDays?: number;
  interval?: string;
  registeredKWp?: number;
  peakKW?: number | null;
  ratio?: number | null;
  points?: HistoricPoint[];
  perDevice?: DeviceRow[];
  isBatteryOnly?: boolean;
  batteryCapacityKWh?: number | null;
  reason?: string | null;
  error?: string;
}

const WINDOWS = [7, 30, 90];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  asset: { assetId: string; assetName?: string } | null;
}

export function AssetHistoricDataDialog({ open, onOpenChange, contractId, asset }: Props) {
  const [windowDays, setWindowDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HistoricResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setWindowDays(7);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !asset?.assetId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: res, error: fnError } = await supabase.functions.invoke('ammp-asset-historic-data', {
          body: { contractId, assetId: asset.assetId, windowDays },
        });
        if (cancelled) return;
        if (fnError) throw new Error(fnError.message);
        if (!res?.ok) throw new Error(res?.error || 'Failed to load historic data');
        setData(res as HistoricResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, asset?.assetId, contractId, windowDays]);

  const points = data?.points ?? [];
  const chartData = points.map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{asset?.assetName || data?.assetName || 'Historic data'}</DialogTitle>
          <DialogDescription>
            PV AC power measured in AMMP, summed across the site's PV inverters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w}
              size="sm"
              variant={windowDays === w ? 'default' : 'outline'}
              onClick={() => setWindowDays(w)}
              disabled={loading}
            >
              Last {w} days
            </Button>
          ))}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
              <div className="font-medium">{data.interval ?? '—'}</div>
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

        {!loading && !error && data && points.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {data.reason === 'no_pv_inverters'
              ? 'This site has no PV inverters registered in AMMP, so there is no PV series to show.'
              : data.reason === 'error'
                ? `AMMP request failed: ${data.error}`
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
                  formatter={(value: number) => [`${Number(value).toFixed(2)} kW`, 'AC power']}
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
                      {d.error && (
                        <div className="text-xs text-destructive">{d.error}</div>
                      )}
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
