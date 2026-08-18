# Show asset IDs in the revision "Still zero" list

## Goal

In the invoice revision dialog, the operator wants to see the AMMP asset ID next to each site name in the "Still zero — set manually" section so they can cross-reference it with AMMP or other reports while entering a manual capacity.

## Change

1. `src/components/invoices/RevisionDialog.tsx`
   - The `StillZeroAsset` rows already carry `assetId`.
   - Render the asset ID on the same line as the asset name, using a muted, small style so it does not dominate the row.
   - Keep the existing label (`0 MWp in AMMP` / `no genset rating in AMMP`) and the manual input.
   - Optionally apply the same treatment to the correctable rows above for consistency, since those also have `assetId` available.

## Result

The still-zero list shows something like:

```text
Site Name
ID: 123abc · 0 MWp in AMMP
[MWp input] [Ignore]
```

This makes it easier to identify which asset is being manually corrected without changing the revision logic or persistence.
