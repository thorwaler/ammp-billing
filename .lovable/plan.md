## Goal

Add a fourth Elum 2026 org-based tier — **Internal** — that discovers its sites from AMMP organisation feature flags (`elum_internal`) instead of asset groups, alongside the existing C&I Lite / C&I Pro / Utility tiers. Pricing uses the stepped MWp brackets from the new contract (€150 / €75 / €37.50), applied across the org portfolio.

The existing `elum_internal` package (asset-group / manual MW based, with the graduated tier editor) stays untouched so current contracts keep working. This is a new, separate package.

## Pricing

Stepped brackets on the organisation's total MWp — each bracket's rate applies only to the MWp inside it:

```text
First 100 MWp      EUR 150 / MWp / year
100 - 500 MWp      EUR  75 / MWp / year
Beyond 500 MWp     EUR 37.50 / MWp / year
```

A 600 MWp portfolio = 100x150 + 400x75 + 100x37.50.

The contract also says Internal supports eConf. Handled the same way as C&I Lite: orgs carrying the `remote_econf` flag get an org-wide eConf add-on line at a configurable €/MWp rate, defaulting to 0 (no charge) until you confirm the rate. Setting the rate later needs no code change.

## Changes

**Pricing config — `src/data/pricingData.ts`**
- New package id `elum_internal_2026`.
- Extend `ElumOrgTier` with `"internal"`; add `internal: "elum_internal"` to `ELUM_TIER_FLAGS`, label `"Internal"` to `ELUM_TIER_LABELS`.
- New `ELUM_INTERNAL_2026_BRACKETS` (stepped 150 / 75 / 37.50) and `ELUM_INTERNAL_2026_ECONF_RATE = 0`.
- Include the new package in `isElumOrgTierPackage` and `elumTierForPackage`.

**Calculation — `src/lib/invoiceCalculations.ts`**
- Add an `internal` branch to `calculateElumOrgTierBreakdown`: compute stepped bracket cost on the org's total MWp, emit per-bracket detail (MWp in bracket, rate, cost) on the org line, and distribute the resulting blended rate onto site rows so the detailed site table shows the correct effective €/MWp and cost.
- Optional eConf add-on on top when the org has the flag and the rate is above 0, merged into the org's total the same way Lite does.
- No Utility-style minimum-site-size gate; Internal has no site size restriction.

**Sync — `supabase/functions/ammp-sync-contract/index.ts`**
- Add `internal: 'elum_internal'` to the edge function's `ELUM_TIER_FLAGS` map so sub-orgs with that flag are classified and their assets fetched via `GET /v1/assets?org_ids=<id>`, exactly as the other tiers.
- Update the "unassigned sub-orgs" alert text to include the new flag.

**Org discovery — `src/services/ammp/orgService.ts`**
- Header comment plus classification picks up the new tier automatically once `ELUM_TIER_FLAGS` includes it; update the note that says Internal keeps a dedicated non-discovered contract.

**Contract form — `src/components/contracts/ContractForm.tsx`**
- New select option: "Elum Internal 2026 (Org-based, stepped MWp)".
- On selection, apply the org-tier defaults path (parent org id field, zero-PV alerts on, freeze toggle, legacy asset-group transition block) already used by Lite/Pro/Utility.
- Store `elum_tier = 'internal'`; keep `org_pricing_config` as `{}` unless an eConf/base rate override is entered.
- Optional overrides for the three bracket rates + eConf rate, saved into `org_pricing_config`.

**Downstream surfaces** — all already keyed off `isElumOrgTierPackage` / `elumOrgTierBreakdown`, so they pick the new tier up once the helpers include it; each gets a quick verification pass:
- `src/lib/supportDocumentGenerator.ts` — per-org section with bracket breakdown table.
- `src/components/dashboard/InvoiceCalculator.tsx` and `src/components/invoices/MergedInvoiceDialog.tsx` — one merged Xero line per sub-organisation.
- `src/components/invoices/UpcomingInvoicesList.tsx` and `src/services/analytics/dashboardAnalytics.ts` — card estimates and contract ARR.
- `src/lib/elumCombinedMinimum.ts` — Internal counts toward the €80k combined Elum minimum (confirm this is wanted; easy to exclude).

**Database** — no migration needed. `package` and `elum_tier` are plain text with no check constraint, and `org_pricing_config` / `cached_capabilities` already hold the org breakdown.

**Memory** — update `mem://features/elum-2026-org-tiers` to cover the Internal tier and its flag.

## Open inputs

1. eConf rate for Internal — shipping with 0 (free) unless you give a €/MWp figure.
2. Whether Internal revenue counts toward the €80k combined Elum annual minimum.
