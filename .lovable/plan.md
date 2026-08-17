# Zero-MW label meaning + Jubaili zero-kVA corrections

## What "0 zero-MW" means today

In the revise dialog, the per-contract line reads `N zero-MW · M new · €X`.

`N` is **not** the number of assets currently at 0 MW. It is the number of *correctable* assets: sites that were frozen at 0 MW in the invoice snapshot **and now report a real capacity in AMMP**. A site that was 0 MW when the invoice was cut and is still 0 MW today is counted as "unchanged", not as a correction — there is nothing to correct yet.

So `0 zero-MW` on contracts full of 0 MW sites means: those sites still have no capacity in AMMP, so the revision would not change their price. That is why the revised total equals the frozen total in the screenshot.

Two clarity fixes in the dialog:
- Relabel to `N correctable` and show the still-zero count alongside, e.g. `0 correctable (42 still 0 MW)`.
- Add a short legend line under the merged banner explaining that only sites whose capacity changed from 0 to a real value can be corrected.

## Jubaili: count 0 kVA too

Jubaili is priced from `gensetKVA` bands, not MW, so a Jubaili site with a genset rating that was missing at freeze time and is now set is exactly the same class of correction — but it is invisible today because the diff only looks at `totalMW`.

Changes:
- Store `gensetKVA` in the invoice snapshot asset rows so future invoices can be diffed on rating.
- Extend the snapshot diff so a correction is either a MW correction (0 → >0) or a kVA correction (null/0 → >0). Each correction row records which metric changed and shows the right unit (MWp or kVA) in the list.
- When applying selected corrections in `zero_mw_only` mode, lift the ticked asset's `gensetKVA` from live data as well as its MW, so the banded fee recomputes.
- Section header becomes "Sites now reporting capacity" and the per-row detail shows `0 → 1250 kVA` for Jubaili rows.
- For invoices frozen before `gensetKVA` was captured, the snapshot rating is unknown; those rows are treated as "rating unknown at freeze" and are only offered as corrections when live data has a rating, clearly labelled so the operator can decide.

## Technical notes

- `src/lib/invoiceSnapshot.ts`: add `gensetKVA?: number | null` to `SnapshotAsset` and map it in `toSnapshotAssets`.
- `src/lib/invoiceRevision.ts`: `ZeroMwCorrection` gains `metric: 'mw' | 'kva'` plus previous/new rating; `diffSnapshotAgainstLive` detects both classes; `applySelectedCorrections` carries live `gensetKVA` for ticked assets; still-zero (uncorrectable) count is returned in `SnapshotDiff`.
- `src/components/invoices/RevisionDialog.tsx`: relabel counters, add legend, render unit-aware correction rows, aggregate the still-zero count across merged contracts.

No database or pricing-engine changes; totals for existing invoices are unaffected unless the operator ticks a correction.
