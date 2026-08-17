# Manual capacity overrides in invoice revision

## How corrections work today

When you open "Revise invoice", the frozen snapshot is compared asset by asset against the latest synced (live) data:

- An asset frozen at 0 MW that now reports a real capacity becomes a **correctable** item (Jubaili: a missing/0 genset rating that is now set counts too).
- Those items are listed with a checkbox and pre-ticked. Ticking one lifts that asset's MW (or kVA) from the snapshot value to the live value; everything else stays exactly as frozen.
- Assets that appeared after the invoice was cut are excluded unless you tick "include newly onboarded".
- The invoice is then recalculated with the patched asset list (per contract for merged invoices), and the new total is shown against the frozen one.

So today you can only influence the result by choosing *which* corrections to apply — the value itself always comes from the latest sync. Assets still at 0 in the sync cannot be corrected at all.

## What to add

A **manual value** column so you can type a capacity for any asset that is still zero, even when the sync has nothing.

- New section "Still zero — set manually" listing every asset that is 0 MW (and, for Jubaili, without a genset rating) in both the snapshot and live data, grouped per contract for merged invoices.
- Each row gets a numeric input: MWp for normal packages, kVA for Jubaili. Leaving it empty means "leave as frozen" (current behaviour).
- Entering a value marks that asset as corrected with your number and includes it in the recalculation immediately, so the revised total updates live.
- Manual values are also allowed to **override** a live-sync correction: correctable rows get the same optional input, so you can enter a different figure than the sync reports.
- A short note on each manually set row ("manual value") and a count in the summary strip, so it is obvious the revision is not purely sync-driven.
- The manual values are stored in the revised invoice's snapshot and in the revision reason metadata, so the support document and any later revision reproduce them.

Scope: manual values apply to the revised invoice only. They are not written back to the contract's cached AMMP data — the next sync still governs future invoices.

## Technical notes

- `src/lib/invoiceRevision.ts`
  - `SnapshotDiff` gains `stillZero: Array<{ assetId, assetName, contractId?, metric: 'mw' | 'kva', frozenMW, frozenKVA }>` (currently only `stillZeroCount` exists).
  - `CorrectionSelection` gains `manualOverrides: Record<string, { mw?: number; kva?: number }>`.
  - `applySelectedCorrections` applies, in order: frozen value → live value (if ticked) → manual override (if present), for both `totalMW` and `gensetKVA`.
  - `patchOrgBreakdown` / `resolveOrgBreakdown` already read MW from the patched asset list, so org-level Elum pricing follows automatically.
- `src/components/invoices/RevisionDialog.tsx`
  - New state `manualOverrides`, wired into the `selection` memo so the recalculation reruns on each edit (debounced input parsing, invalid/negative values ignored).
  - Render the still-zero list per contract with unit-aware inputs and a clear-all button; show "N correctable · M manual · K still zero" in the summary.
  - Persist overrides in the new snapshot (`manualOverrides` key) alongside the recomputed assets.
