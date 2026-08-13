# Remove the legacy asset group row from the Internal contract

## What's happening

The Internal contract (`Internal`, Elum Internal 2026, tier `internal`) is already configured for flag-only resolution in the sync code, but its stored asset cache still contains a third pseudo-organisation, `Legacy asset group — standard`, with 6 DEV ELUM sites at 0.000 MWp and €0.00. That is why the organisation breakdown table and the support document still show the row: the cache was written by the last sync (13 Aug, 08:59) before the flag-only change took effect, and nothing has rewritten it since.

The row contributes €0.00, so no invoice amount changes — it is purely noise in the tables (and it is what triggers the new "6 sites have no PV capacity" warning).

## Fix

1. Redeploy the AMMP sync function so the flag-only branch for internal contracts is live, then re-sync the Internal contract and confirm the cache holds only `Elum Internal` (27) and `Assets On Hold` (67) — no legacy entry.
2. As a safety net, drop legacy pseudo-organisations at read time for internal contracts: any org entry whose id starts with `legacy:` is filtered out of the organisation breakdown when the contract's Elum tier is `internal`. This keeps old caches and any contract that hasn't been re-synced clean in the calculator, the support document, the PDF, and the contract details panel.
3. Keep the "ignored (flag-only)" note in the Org resolution panel so it stays visible that the contract still has a legacy asset group configured but is not billing it.

## Technical notes

- `src/lib/invoiceCalculations.ts` — in the Elum org-tier breakdown builder, skip cached orgs with `orgId.startsWith('legacy:')` when the contract tier is `internal`; totals and site counts recompute from the remaining orgs.
- `src/pages/ContractDetails.tsx` — apply the same filter to the org categories/resolution list so the panel matches the invoice.
- `supabase/functions/ammp-sync-contract/index.ts` — no logic change needed; redeploy and re-sync contract `Internal`.
- No database or pricing changes; the removed row is €0.00.
