# Jubaili: show kVA and flag off-tier sites everywhere

The Jubaili contract is now priced per site by genset rating (kVA), but the contract page's Asset Breakdown still only shows MW, hybrid, Solcast and device counts. This makes the breakdown match the new invoicing model and makes problem sites obvious before an invoice is created.

## What changes

### Contract page — Asset Breakdown (Jubaili contracts only)
- New **kVA** column showing each site's genset rating, and a **Band** column showing which pricing band it falls into with the annual fee.
- Status flag per row:
  - **Unrated** — no genset rating in AMMP, so the site is not billed.
  - **Clamped** — rating sits outside the configured bands and is billed at the nearest band.
  - **Name mismatch** — the kVA in the site name differs from the AMMP value by more than 20% (billed on the AMMP value).
- A summary strip above the table: total sites, rated sites, unrated sites, clamped sites, name mismatches, and the resulting annual banded total.
- A warning banner when any site is unrated, clamped or mismatched, telling the user these need fixing in AMMP.
- MW/hybrid/Solcast columns stay, since they're still useful, but kVA leads for Jubaili.

### Invoice calculator
The Jubaili band breakdown already lists bands and site statuses. Adds:
- A compact counts line (billed / unrated / clamped / mismatched) at the top of the Jubaili section so problems are visible without scrolling the site list.
- Unrated, clamped and mismatched sites are always shown rather than folded into the site list.

### Support document
- The per-site Jubaili table keeps the kVA and band columns and gains an explicit **Status** column with the same three flags.
- A short note under the table listing how many sites are unrated (excluded from billing) and how many were clamped, so the customer-facing document explains the totals.

## Technical notes
- All flag logic already exists in `calculateElumJubailiBreakdown` (`src/lib/invoiceCalculations.ts`) via `JubailiSiteLine.status`, `clamped` and `nameKva`. Nothing changes in the pricing math — this is presentation only.
- The contract page (`src/pages/ContractDetails.tsx`) will call the same helpers (`resolveJubailiBand`, `formatJubailiBandLabel`, `parseKvaFromName`) against `cached_capabilities.assetBreakdown[].gensetKVA`, using the contract's own bands from `org_pricing_config.jubailiKvaBands` with the defaults as fallback, so the page and the invoice never disagree.
- The new columns and summary render only when the contract package is `elum_jubaili`; every other package's Asset Breakdown is untouched.
- Sites still need an AMMP re-sync for `gensetKVA` to be populated; where it's missing, rows show as Unrated with a prompt to sync.
