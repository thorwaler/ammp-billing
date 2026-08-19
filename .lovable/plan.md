# Fix long historic-data windows and add a 12-month view

The 7-day view works; 30 and 90 days come back empty. Confirmed from the backend logs and the AMMP
error: the viewer switches to a `1h` interval for windows longer than 7 days, and AMMP rejects it —
`The interval param needs to match one of the following formats: ['5m', '15m']`. Every device call
then fails, so the chart has zero points.

Since AMMP only serves 5m/15m raw data, longer windows have to be assembled from many short requests
and aggregated on our side.

## What you get

- Window options: 7 days, 30 days, 90 days, and 12 months.
- Short windows (7/30 days) keep the detailed 15-minute shape.
- Long windows (90 days, 12 months) show one point per day: the daily peak PV AC power, which is
  what matters for the capacity sanity check. A note under the chart says the series is daily peaks.
- Long windows load progressively: the chart fills in as slices arrive, with a small progress
  indicator ("loaded 4 of 9 slices"), so nothing times out on a big site.
- Partial failures no longer blank the chart — whatever was fetched is drawn, and failing devices or
  slices are listed with their error.

## How it works

- Every AMMP request uses a supported interval (`15m`); the `1h` branch is removed.
- The requested window is cut into slices of at most ~30 days. Each backend call handles one slice
  for the asset's PV inverters (each device request itself chunked to a range AMMP accepts) and
  returns the aggregated series for that slice.
- The browser requests slices in sequence and merges them, so no single call runs long enough to hit
  the function execution limit.

## Technical notes

`supabase/functions/ammp-asset-historic-data/index.ts`:
- Fix `interval = "15m"`; delete the `windowDays > 7 ? "1h"` branch.
- New input shape: `{ contractId, assetId, dateFrom, dateTo, granularity: 'raw' | 'daily' }`
  (keep `windowDays` accepted for the short-window path). Validate ISO dates and cap slice span.
- Per device, split the slice into <= 7-day sub-requests, merge `extractSeries` output per timestamp
  (max wins), then sum across devices.
- `granularity: 'daily'` reduces the merged series to one max-value point per UTC day before
  responding; `'raw'` keeps the existing ~500-point bucketed downsample.
- Response gains `granularity`, `dateFrom`, `dateTo`, and per-device slice errors; a wall-clock
  deadline returns partial results with `truncated: true` rather than failing.

`src/components/contracts/AssetHistoricDataDialog.tsx`:
- Add a "Last 12 months" toggle; map 7/30 days to `raw` and 90 days/12 months to `daily`.
- Compute the slice list client-side, fetch slices sequentially, accumulate points, per-device peaks
  and point counts, and render progressively with a progress line.
- Show "daily peak" labelling on the axis/tooltip when granularity is daily, plus a truncation note
  when returned.

No schema changes; nothing is persisted.
