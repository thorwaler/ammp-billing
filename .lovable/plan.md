# Fix 30/90-day historic data windows

The 7-day view works; 30 and 90 days come back empty. Confirmed cause from the backend logs and the
AMMP error you pasted: the viewer switches to a `1h` interval for windows longer than 7 days, and
AMMP rejects it — `The interval param needs to match one of the following formats: ['5m', '15m']`.
Every device call then fails, so the chart has zero points.

## Fix

- Always request a supported interval (`15m`); never send `1h`.
- Split longer windows into chunks of at most 7 days per device request, fetch them sequentially,
  and merge the results into one series before summing across devices.
- Keep the existing downsampling to ~500 points, so a 90-day view stays light in the browser.
- If some chunks fail while others succeed, still show the partial series and surface the failure
  message per device instead of rendering an empty chart.

## Technical notes

`supabase/functions/ammp-asset-historic-data/index.ts`:
- Remove the `windowDays > 7 ? "1h" : "15m"` branch; fix `interval = "15m"`.
- Add a chunking helper that yields `date_from`/`date_to` pairs of <= 7 days covering the window,
  and loop it per PV inverter device, merging `extractSeries` output per timestamp (max wins).
- Cap total requests (devices x chunks) with a soft budget and a wall-clock deadline so the function
  stays within its execution limit; if the budget is hit, return what was collected plus a
  `truncated: true` flag and the effective covered range.
- Report `interval` and, when truncated, the actual window covered, in the response.

`src/components/contracts/AssetHistoricDataDialog.tsx`:
- Show a small note when the response is truncated ("showing the last N days of the requested
  window"), and keep the existing error/empty states otherwise.

No schema changes; nothing is persisted.
