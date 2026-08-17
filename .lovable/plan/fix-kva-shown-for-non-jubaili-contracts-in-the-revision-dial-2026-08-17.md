# Fix: kVA shown for non-Jubaili contracts in the revision dialog

## Problem

In the "Still zero — set manually" list, every contract shows "no genset rating in AMMP" with a kVA input. Genset ratings only matter for the Elum Jubaili package; all other contracts should show "0 MWp in AMMP" with an MWp input.

The metric is currently chosen per asset by checking whether a `gensetKVA` field is present on the snapshot or live asset, not by the contract's package. Since the sync now writes a `gensetKVA` key (often null) on assets for every Elum contract, non-Jubaili contracts fall into the kVA branch.

## Fix

Decide the metric from the contract package instead of from the asset shape.

1. `src/lib/invoiceRevision.ts`
   - `diffSnapshotAgainstLive` takes an extra option carrying the contract's package (or a simple `kvaPricing: boolean`).
   - Still-zero rows: `metric = kvaPricing ? 'kva' : 'mw'` — no more `gensetKVA !== undefined` sniffing.
   - The "no rating at freeze, rating now" correction branch only runs when `kvaPricing` is true; otherwise only the 0 MW → >0 MW correction applies.
   - Manual overrides continue to be interpreted in the row's metric, so non-Jubaili rows accept MWp only.

2. `src/components/invoices/RevisionDialog.tsx`
   - When diffing each merged unit, pass that unit's package (from the snapshot's per-contract row, falling back to the live contract row) so each contract in a merged invoice gets its own metric.
   - Correctable-row labels and input placeholders follow the same per-contract metric.

## Result

Only Jubaili contracts show kVA rows, bands, and kVA inputs. Every other contract shows "0 MWp in AMMP" with an MWp input, both in the correctable list and the still-zero list, including inside merged invoices where the two can appear side by side.
