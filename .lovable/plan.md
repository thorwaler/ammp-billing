# Why the revised total shows €750

## What the data says

The invoice in the screenshot (€35,980.28, contract `elum_ci_lite`) has a snapshot with **1,179 assets and 232 organisation rows**. The contract's current cached AMMP data holds only **135 assets and 62 organisations** (the org resolution changed after exclusions/re-syncs).

Two separate problems produce the €750 figure and the odd counts:

1. **The fidelity check recomputes without any organisation breakdown.** Elum 2026 tiered contracts are priced per sub-organisation. The "recompute the untouched snapshot" check passes `undefined` for the org breakdown, so the calculator falls back to the non-org path and returns a base/minimum-only figure — €750. Nothing is wrong with the frozen invoice; the comparison itself is invalid.
2. **The diff compares the snapshot against a shrunken live asset list**, which is why it reports "1044 frozen assets no longer exist" and zero zero-MW corrections. That part is real data drift, but the revision UI presents it without making clear the org structure also changed.

So the revised total is not wrong pricing — the verification recompute is missing the pricing inputs.

## Fix

**Reconstruct the org breakdown for recomputation**
- Rebuild an org breakdown from `snapshot.orgs` (org id, name, tier, econf flag, rate, MW, site count) and attach the snapshot assets to their org where membership is known, so `computeRevision` and `verifySnapshotReproduces` both price through the org path.
- When live org data exists, use live orgs only for structure of orgs that still exist; orgs present only in the snapshot keep their frozen rate and MW so the frozen total reproduces.

**Store org membership in future snapshots**
- Extend the snapshot org rows to include their asset ids so revisions of newly created invoices can be reconstructed exactly instead of inferred.

**Make the dialog honest about what it can do**
- If the snapshot cannot be reproduced within tolerance, show a blocking notice ("this invoice cannot be recomputed faithfully — org data has changed") instead of presenting a bogus revised total, and disable "Create revised invoice" unless the operator explicitly overrides.
- Show org-count drift (232 snapshot orgs vs 62 live) alongside the asset drift so the cause is visible.

## Technical notes

- `src/lib/invoiceRevision.ts`: add `orgBreakdownFromSnapshot(snapshot, patchedAssets)`; use it as the fallback in `computeRevision` when `liveOrgBreakdown` is missing or covers fewer orgs than the snapshot; pass it in `verifySnapshotReproduces`.
- `src/lib/invoiceSnapshot.ts`: add `assetIds?: string[]` to `SnapshotOrgRow` and populate from `caps.orgBreakdown[].assets`.
- `src/components/invoices/RevisionDialog.tsx`: gate the confirm button on `fidelity.ok`, add an override checkbox, and surface org-count drift.
- No changes to invoice calculation logic or to already-issued invoices.
