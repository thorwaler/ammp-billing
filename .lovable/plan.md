# Elum data-quality flags: battery-only sites and unrealistic PV capacity

Two new data-quality checks alongside the existing zero-PV / zero-kVA flags.

## 1. Battery-only sites (no PV inverter)

A site counts as **battery-only** when its cached device list contains no PV inverter
(`pv_inverter`, or an EMS/meter that reports PV) but does contain a battery device
(`battery_system` / `battery_inverter`).

What happens:
- The AMMP sync stores two new fields per asset in the contract cache:
  `isBatteryOnly` and `batteryCapacityKWh` (read from battery device metadata /
  asset params when AMMP exposes it; left null when unknown).
- Sites flagged battery-only are separated out of the plain "capacity not set"
  warning in support documents and labelled "battery-only — no PV inverter",
  so they stop looking like broken PV sites.
- A new alert type `battery_only_site` is raised per contract by the same scan that
  raises zero-PV alerts, listing the affected sites.
- In the invoice revision dialog, a battery-only site in the "still zero" list shows
  its suggested battery capacity next to the manual input, with a one-click
  "use battery capacity" button that fills the override. Pricing is never changed
  automatically — you always confirm.

Edge case handled: if an EMS device reports PV data even without a registered
inverter, the site is not flagged (EMS-with-PV detection reuses the existing
hybrid/EMS logic).

## 2. Unrealistic PV capacity (on-demand sanity check)

A "Run capacity sanity check" button on the contract details page, next to the
sync controls. It queries observed maximum PV power per asset from the AMMP Data
API and compares it against the registered capacity.

- ratio = observed peak AC power / registered PV capacity
- ratio below 0.3 → registered capacity looks too high (suspicious)
- ratio above 1.2 → registered capacity looks too low (suspicious)
- no power data returned → separate "no data" status, listed apart, no alert
- ignored ("zombie") assets are skipped entirely

Results appear in a panel under the button: a table of asset name, asset ID,
registered MWp, observed peak, ratio, and status (OK / too high / too low / no data),
with a summary strip. Suspicious sites raise a single `pv_capacity_ratio` alert per
contract so it also shows up in the Alerts page and Slack routing; "no data" rows
never raise alerts. Re-running replaces the previous result.

Thresholds are fixed at 0.3 / 1.2 for now.

## Technical notes

- `supabase/functions/_shared/ammpTypes.ts`: add `isBatteryOnly`,
  `batteryCapacityKWh` to `CachedAssetBreakdown`.
- `supabase/functions/ammp-sync-contract/index.ts`: compute both fields in the
  capability builder, preserve them in the merge-with-existing-cache path.
- `supabase/functions/_shared/zeroPvScan.ts`: exclude battery-only sites from the
  zero-PV asset set and raise the `battery_only_site` alert instead.
- New edge function `ammp-capacity-sanity-check`: takes `{ contractId }`, validates
  the caller's JWT, walks the contract's cached assets, requests peak PV power per
  asset through the existing AMMP token + data-proxy path in batches with a time
  budget, and returns per-asset rows plus a summary; raises the alert server-side.
- `src/pages/ContractDetails.tsx`: button, results table, summary strip.
- `src/lib/supportDocumentWarnings.ts`: new `battery-only` site status feeding both
  `SupportDocument.tsx` and `PdfRenderer.tsx` through the shared `siteCapacityLabel`.
- `src/lib/invoiceRevision.ts` + `src/components/invoices/RevisionDialog.tsx`:
  carry `batteryCapacityKWh` into still-zero rows and add the fill-override action.
- `src/components/alerts/AlertCard.tsx`: render the two new alert types' metadata
  (asset names, IDs, ratios) using the existing rich-metadata renderer.
