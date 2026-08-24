# Cleanup pass after today's battery-proxy and revision work

A review of everything touched today (battery inverter proxy, revision dialog, targeted enrichment, dialog scrolling) found no correctness bugs — no numeric `||` misuse, no missing null guards on battery ratings, no non-UTC date parsing, and the two copies of the capacity resolver are currently in sync. What it did find is structural debt worth clearing now, before the next change makes it harder.

## 1. One 978-line revision dialog

`RevisionDialog.tsx` now holds data loading, correction/override logic, payload building and rendering in a single component. Split it:

- Extract a `useRevisionData` hook for the initial load and per-contract diff.
- Extract a `useManualCorrections` hook for overrides, battery values, bulk actions and the targeted battery fetch.
- Move the ~205-line confirm handler's payload construction into `invoiceRevision.ts` as a plain function, leaving the component with the click handler, toasts and navigation.
- Pull the "Sites now reporting capacity" and "Still zero — set manually" sections into two child components.

Behaviour, layout and the scrolling fixed earlier stay exactly as they are.

## 2. Live data is reloaded by two copies of the same code

The initial load effect and the "Fetch battery data" action both run the identical fetch-all-contracts-then-map sequence. Collapse into one `reloadLiveData()` used by both, so a change to how live data is resolved can't apply to only one path.

## 3. Drop the battery-only in-memory registry

`src/lib/batteryOnlyAssets.ts` is a module-level `Map` that is never cleared, so a long session that moves between contracts can carry stale battery flags. It predates `isBatteryOnly` / `batteryCapacityKWh` travelling on the asset objects themselves, and the revision dialog already prefers the inline fields.

Plan: pass the battery fields explicitly into `supportDocumentWarnings.ts` (its only remaining hard dependency) and to the contract-details and calculator call sites, then delete the module and the three `register…` calls. If any of those call sites turns out not to have the fields inline, that one keeps reading them from the cached capabilities it already loads — no global registry either way.

## 4. Shared device detection in the edge functions

`isBatteryOnly`, PV-inverter/PV-capable-peripheral and hybrid/genset detection are copy-pasted between `ammp-sync-contract` and `ammp-device-enrichment`. Move them into a new `_shared/deviceDetection.ts` so sync and enrichment cannot classify the same site differently. Same treatment for the near-identical zero-PV and battery-only alert inserts in `_shared/zeroPvScan.ts`, which become one small "insert if no unacknowledged duplicate" helper.

## 5. Small items

- `proxiedAssets` in `src/lib/effectiveCapacity.ts` has no call site — remove it.
- Type the battery fields on `LiveAsset` in `invoiceRevision.ts` so the `(live as any)` casts around them disappear and typos fail at compile time.
- Add a short comment where AMMP's `battery_inverter_power` (watts → kW rating) and `battery_capacity` (Wh → kWh energy) are read, since both are divided by 1000 into plain numbers and are easy to transpose.
- Keep the two `effectiveCapacity` copies (Deno can't import from `src/`), but add a header note on each pointing at the other as the mirror that must be updated in the same change.

## Out of scope

No pricing, tier, invoice-total, alerting or schema changes. This pass must leave every computed invoice value identical.
