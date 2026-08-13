# Invoice revision: update a frozen invoice without deleting it

## What exists today

- Freezing works: on creation, a full input snapshot (assets, org rows, contract rates, FX rate, zero-PV substitutions, period bounds, line items, totals) is stored on the invoice together with `snapshot_frozen_at` and a 30-day `revision_deadline`.
- The invoice list and the details dialog show the freeze badge and how many days of the revision window are left.
- The database already has a `revised_from_invoice_id` column linking a new invoice to the one it replaces.

What does **not** exist: nothing ever writes `revised_from_invoice_id`, and there is no "revise" action anywhere in the UI. So today the only way to correct an invoice is delete and recreate — the snapshot is currently just an audit record, not something you can act on.

## What to build: a "Revise invoice" action

Available on any invoice that is frozen and still inside its 30-day revision window.

Flow:

1. From the invoice row (and the details dialog), choose **Revise**.
2. A dialog opens showing the stored snapshot next to today's live data — asset count, total MW, per-org rows, rates, FX — with the differences highlighted, so it is clear what changed since the invoice was cut (typically zero-PV assets that have since reported real capacity).
3. Choose what the revision recalculates from:
   - **Correct zero-MW assets only** (default) — only assets that were 0 MW in the snapshot and now report a real capacity are updated to their current MW. Every other asset, rate and total stays exactly as frozen. The dialog lists these assets with old (0) vs new MW and lets you tick/untick each one.
   - **Recalculate from current data** — re-run the invoice fully using live synced assets and the same period/contract terms.
   - **Keep snapshot, adjust manually** — start from the frozen numbers and edit only the values that were wrong.
4. **Exclude newly onboarded assets** (on by default) — any asset present in live data but absent from the snapshot is left out of the revision, so a correction never sneaks in sites that were onboarded after the invoice was cut. The dialog shows how many assets this excludes; unticking pulls them in.
5. Preview the new totals and line items with a before/after delta.

6. Confirm. The system then:
   - Creates a **new invoice** for the same contract, customer, period and billing frequency, with `revised_from_invoice_id` pointing at the original, its own fresh snapshot and revision window.
   - Marks the original as superseded (it stays in history for audit, is excluded from revenue totals, and is labelled "Revised → <new invoice>").
   - Reverses the original's side effects and re-applies them on the revision: prepaid/YTD balance deltas, zero-PV incident links, site billing (onboarding/annual) markers.
   - Regenerates the support document and replaces the old file in SharePoint instead of adding another copy.
   - For Xero: if the original was never sent, nothing to do. If it was sent, the dialog offers either updating the existing Xero invoice in place (only possible while it is a draft) or voiding it and sending the revision as a new invoice; otherwise it warns that Xero must be corrected manually.

Outside the window (or on an unfrozen invoice) the action is disabled with an explanation, and delete-and-recreate stays the fallback.

## Technical notes

- New helpers in `src/lib/invoiceSnapshot.ts`: `diffSnapshotAgainstLive()` (classifies each live asset as unchanged, zero-MW-corrected, newly onboarded, or removed) , `applySelectedCorrections()` (returns a patched asset list from the snapshot plus the ticked corrections) and `buildRevisionFields()`.
- New `RevisionDialog.tsx` under `src/components/invoices/`, reusing the existing calculation path in `invoiceCalculations.ts` and the shared `buildPackageLineItems` from `src/lib/xeroLineItems.ts` so revised line items match freshly created ones.
- Side-effect reversal reuses `src/lib/prepaidBalance.ts` (`reverseSingleContractDelta` / `reverseMergedDeltas`) and the SharePoint delete function already used by invoice deletion.
- Database: add `superseded_by_invoice_id` (or a `status` marker) on `invoices` so revised originals can be filtered out of analytics, reports and ARR/NRR aggregation.
- Xero update path extends `xero-send-invoice` with an update-existing-draft mode plus a void mode.
- Merged invoices: revision applies per merged invoice as a whole, re-splitting deltas across the contained contracts.

## Open question

Whether revising should always create a new invoice record (recommended, cleaner audit trail) or overwrite the existing one in place. The plan above assumes a new record.
