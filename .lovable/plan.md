# Ignore "zombie" assets in alerts and zero-capacity flags

Some AMMP sites have never sent PV data (or stopped years ago). They keep triggering zero-PV alerts and zero-capacity warnings even though nobody intends to fix them. This adds a way to mark such an asset as **not relevant**, globally, so it is silenced everywhere while still appearing (labelled) in support documents.

## Behaviour

- An ignored asset:
  - never opens a zero-PV incident and never appears in a zero-PV alert
  - is excluded from the "N site(s) have no PV capacity / genset rating" warnings
  - is shown in support-document tables with an "ignored" tag instead of a warning marker
  - is hidden from the revision dialog's "correctable" and "still zero — set manually" lists
  - is still priced exactly as today (normally €0 at zero capacity) — no billing change
- The flag is global per AMMP asset id, so marking it once covers every contract.
- Each entry stores an optional reason and who set it, and can be removed at any time.

## Where the user sets it

1. **Contract details → asset breakdown table**: a per-row "Ignore for alerts" toggle (with a small "ignored" badge on the row).
2. **Revise invoice dialog**: an "Ignore this site" action on each zero row, so a zombie discovered during a revision can be silenced without leaving the dialog. Ignoring a row removes it from that dialog's zero lists immediately.

## Technical notes

**Database** — new table `public.ignored_assets`:

- `id`, `asset_id` (unique), `asset_name`, `reason` (nullable), `created_by`, `created_at`
- GRANTs for `authenticated` (select/insert/update/delete) and `service_role` (all)
- RLS on; team-wide access model: read for any authenticated user, write gated by `public.can_write(auth.uid())`, matching the existing tables

**Backend**

- `supabase/functions/_shared/zeroPvScan.ts`: load ignored asset ids once per run; skip them when computing `zeroAssets`, when opening incidents and when building alert metadata. If a contract's only zero assets are ignored, no alert is raised.

**Frontend**

- New hook `src/hooks/useIgnoredAssets.ts`: fetches the ignored set, plus `ignore(assetId, name, reason)` / `unignore(assetId)` mutations.
- `src/lib/supportDocumentWarnings.ts`: `collectZeroCapacitySections` takes an optional ignored-id set and filters those sites out of the warning sections.
- `src/lib/supportDocumentGenerator.ts` / `SupportDocument.tsx` / `PdfRenderer.tsx`: carry an `ignored` flag on site rows and render an "ignored" label in the capacity cell instead of the zero-capacity warning styling.
- `src/lib/invoiceRevision.ts`: `diffSnapshotAgainstLive` accepts an ignored-id set and omits those assets from `corrections` and `stillZero` (counts adjust accordingly).
- `src/pages/ContractDetails.tsx`: ignore toggle column in the asset breakdown table.
- `src/components/invoices/RevisionDialog.tsx`: "Ignore this site" action on zero rows, refreshing the diff after the change.

## Out of scope

- No change to pricing, site counts or invoice totals.
- No auto-detection of zombies (e.g. "no data for 2 years") — marking stays manual for now.
