# Battery capacity as a fix for zero-MW sites in revisions + the drifting revised total

## Part 1 — Why the revised total is lower than the frozen one

Confirmed against the merged invoice in the screenshot (frozen €36,016.02, 6 contracts):

| Contract | Assets in snapshot | Assets in current AMMP data | Orgs snapshot / live |
| --- | --- | --- | --- |
| Internal | 90 | 89 | 2 / 2 |
| C&I Pro | 276 | 275 | 167 / 166 |
| others | unchanged | unchanged | unchanged |

Two sites (one Internal, one C&I Pro) have disappeared from AMMP since the invoice was frozen. The revision engine keeps them in the asset list at their frozen MW — that part is right — but Elum pricing is driven by the **organisation breakdown**, and that breakdown is taken from live data whenever it covers at least as many orgs as the snapshot. A vanished site is no longer a member of any live org, so it silently drops out of the priced set. The Internal subtotal falls from €6,303.16 to €6,282.54 (-€20.62), which is the whole -€20.63 difference on the invoice.

Nothing about the invoice changed — this is purely asset drift leaking into the recompute.

**Fix:** when resolving the org breakdown, re-attach snapshot assets that are missing from the live orgs to the org they belonged to in the snapshot (union of live membership plus snapshot-only members), instead of dropping them. Sites removed from AMMP then keep contributing exactly as frozen, and the untouched revision reproduces the frozen total. The dialog also gets a small note per contract when this happens ("1 frozen site no longer in AMMP — kept in its frozen organisation").

## Part 2 — Showing BESS / battery capacity as a solution for still-zero sites

In the "Still zero — set manually" list, every row that has battery data will show it and offer it as a one-click value:

- Row detail line gains the battery figures when AMMP has them: `battery inverter 300 kW · 1,200 kWh battery`.
- A **Use battery** button next to the input fills the manual override with the battery inverter rating converted to MWp (300 kW → 0.3 MWp), so the recomputed total updates immediately and the row is marked "manual value (battery)".
- Rows where only battery *storage* capacity (kWh) is known — no inverter rating — show the kWh and still let you type a value by hand; kWh is not silently converted to MWp.
- A header action **Use battery capacity for all (N)** fills every eligible still-zero row at once, plus the existing clear-all.
- The summary strip and the persisted snapshot record which manual values came from battery data, so the support document can label them.

### Important data caveat

A check of the current Elum/Enterprise contracts shows the field the proxy needs is not populated yet: of 1,918 cached assets, `batteryInverterKW` is present on 0 and no asset is flagged battery-only, even though a sync ran today. That is expected — `asset_specific_params.battery_inverter_power` is only returned by the single-asset endpoints, and the Elum 2026 contracts resolve their assets through the org list endpoint, which always returns it as null.

So the UI alone would show nothing. The plan therefore also includes:

- A **Fetch battery data** action in the still-zero section that runs the existing device-enrichment path for just those asset IDs and refreshes the list — a targeted, small number of single-asset calls rather than a full resync.
- Making the enrichment path store `batteryInverterKW`, `isBatteryOnly` and `batteryCapacityKWh` for org-resolved contracts as well, so a normal sync eventually fills them in for everyone.

## Technical notes

- `src/lib/invoiceRevision.ts`
  - `resolveOrgBreakdown` / `patchOrgBreakdown`: keep snapshot-only org members (assets absent from live orgs) attached to their snapshot org; expose a count of re-attached assets for the UI.
  - `StillZeroAsset` gains `batteryInverterKW`, `batteryCapacityKWh`, `isBatteryOnly`, read from the live asset row in `diffSnapshotAgainstLive`.
  - `ManualOverride` gains `source?: 'manual' | 'battery'` so the origin is persisted.
- `src/components/invoices/RevisionDialog.tsx`: battery columns, per-row and bulk "Use battery" actions, "manual value (battery)" labelling, the re-attached-asset note, and the targeted fetch action.
- `supabase/functions/ammp-device-enrichment/index.ts`: accept an explicit asset-id list, and persist the battery fields for org-resolved contracts.
- No schema migration; everything rides in `contracts.cached_capabilities` and the invoice snapshot.
