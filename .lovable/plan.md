# Historic data viewer in the asset breakdown

Add a per-site "View data" view on the contract's asset breakdown, so you can see the actual AMMP
time series behind a site instead of only the capacity verdict.

## What you get

- A small chart icon on each row of the asset breakdown table (next to the existing badges).
  Clicking it opens a dialog for that site — it does not open the existing asset detail sheet.
- The dialog shows, for the selected site:
  - A window selector: last 7 days (default), 30 days, 90 days.
  - A line chart of PV AC power (kW) over that window, summed across the site's PV inverters.
  - A header strip with observed peak kW, registered kWp, and the implied ratio — the same numbers
    the capacity sanity check uses, so a flagged site can be inspected directly.
  - Per-device rows (device name, peak kW, number of points) so you can see which inverter is
    missing data.
- Clear empty/error states: "no PV inverters on this site", "AMMP returned no data for this window",
  or the actual request error message.
- Battery-only sites show a note that PV data is not expected, with battery capacity when known.

## How the data is fetched

AMMP has no asset-level data endpoint. The series comes from
`GET /v1/devices/{device_id}/historic-data/pv-inverter` with ISO-8601 `date_from`/`date_to` and a
`15m` interval — the same call the capacity sanity check already makes successfully. Those responses
are large, so the fetch happens server-side and only a downsampled series is returned to the browser.

## Technical notes

- New edge function `supabase/functions/ammp-asset-historic-data/index.ts`:
  - Input: `{ contractId, assetId, windowDays }`, validated; user JWT + `can_write` check, mirroring
    `ammp-capacity-sanity-check`.
  - Resolves PV inverter device IDs from `contracts.cached_capabilities` (fallback: live
    `/assets/{id}/devices?include_virtual=true`), reusing the resolution logic from the sanity check.
  - Fetches each device's `historic-data/pv-inverter`, reads `pv_inverter_ac_P_total.datasets[].data`,
    aligns points on timestamp, and returns:
    `{ points: [{ t, kW }], perDevice: [{ deviceId, deviceName, peakKW, points }], peakKW,
       registeredKWp, ratio, windowDays, error? }`.
  - Downsamples to at most ~500 points before responding (bucketed max), and caps devices per asset
    as the sanity check does.
- New component `src/components/contracts/AssetHistoricDataDialog.tsx`: recharts `LineChart` (recharts
  is already used in the project), window toggle, summary strip, per-device table, loading/error
  states. Colors from semantic tokens only.
- `src/pages/ContractDetails.tsx`: add the trigger button in the asset-name cell (with
  `stopPropagation` so it doesn't open the asset sheet) and render the dialog with the selected
  asset id.
- No schema changes; nothing is persisted.
