# Why the revised total shows €750

## Root cause: merged invoices have no usable snapshot

The invoice in the screenshot is a **merged invoice covering 6 Elum contracts** (`merged_contract_ids` has 6 entries, €35,980.28, 1,179 assets, 232 org rows).

When a merged invoice is frozen, the snapshot stores:

```text
contract: { mergedContractIds: [...6 ids] }
```

That is the only contract data saved — no package, no rates, no modules, no org pricing config. The revision engine rebuilds calculation inputs from `snapshot.contract`, so it sees no package and falls back to the default `starter` package with no organisation breakdown. That fallback is what produces €750. The frozen €35,980.28 is correct; the recompute is meaningless.

Two secondary issues make it worse:
- The revision recompute passes **no org breakdown**, so even a single Elum contract would misprice (Elum 2026 tiers are priced per sub-organisation).
- The diff compares 1,179 frozen assets against the **first contract's** current 135 assets, which is why it claims 1,044 assets disappeared and offers zero corrections.

## Fix

**1. Make merged snapshots complete**
- Store a per-contract array in the snapshot: each entry keeps that contract's full row (package, rates, modules, addons, org pricing config), its resolved assets, its org breakdown, its period bounds and its computed subtotal.
- Keep the aggregate assets/orgs/totals for display, but recomputation reads the per-contract entries.

**2. Teach revision to handle merged invoices**
- Recompute per contract with its own params and sum the subtotals, instead of treating the merge as one contract.
- Diff assets per contract against that contract's live data, so drift is attributed correctly instead of appearing as one mass disappearance.
- Rebuild the org breakdown from the snapshot when live org data is missing or has shrunk, so Elum tier pricing reproduces.

**3. Block revision when the snapshot cannot reproduce the frozen total**
- Legacy merged invoices (like this one) have no per-contract data and can never be reproduced. Detect that case, show a clear message ("this merged invoice was frozen before per-contract snapshots — revise by deleting and re-issuing"), hide the bogus revised total, and disable the confirm button.
- For newer snapshots, keep the fidelity warning but require an explicit override tick before revising when the recompute disagrees with the frozen total.

## Technical notes

- `src/lib/invoiceSnapshot.ts`: add `contracts?: SnapshotContractEntry[]` (contract row, assets, orgs, period, subtotal); populate from `MergedInvoiceDialog`.
- `src/components/invoices/MergedInvoiceDialog.tsx`: pass the per-contract data already available in `selectedContractsList` instead of only `mergedContractIds`.
- `src/lib/invoiceRevision.ts`: add `orgBreakdownFromSnapshot()`; make `computeRevision`/`verifySnapshotReproduces` loop over `snapshot.contracts` when present and pass an org breakdown; expose a `reproducible: false` reason for legacy merged snapshots.
- `src/components/invoices/RevisionDialog.tsx`: per-contract drift display, blocked state for non-reproducible snapshots, override checkbox otherwise.
- No change to invoice calculation logic or to invoices already issued.
