# Jubaili kVA: fix the missing genset ratings, then surface them everywhere

## What the data shows

The Jubaili contract (Elum SAS, 575 sites) synced successfully at 09:14 today, but **not one cached asset carries a `gensetKVA` value — the field is absent from every stored asset record**. That is why all 575 sites report "no genset rating" and nothing is billed. The cached totals also confirm these are genset sites, not PV: 575 sites for 1.05 MW combined.

So the calculation logic is behaving correctly; it is being fed no ratings. There are two possible causes and the plan verifies which before changing pricing behaviour:

1. The bulk `GET /assets` call the sync uses (10,806 assets in one response) may not include `genset_capacity` — it may only be returned on the per-asset endpoint or behind a field/include parameter.
2. The rating is present in the response but is not reaching the stored record.

## Step 1 — Confirm the source of the ratings

Add temporary diagnostic logging to the sync that prints the raw AMMP payload keys for a handful of Jubaili assets, then run the sync and read the logs. This answers directly whether `genset_capacity` is present on the bulk `/assets` response, present but named differently, or absent.

## Step 2 — Fix the fetch based on what Step 1 shows

- **If the bulk response carries it**: correct the mapping so the value is persisted, and confirm on a re-sync that ratings appear.
- **If the bulk response omits it**: fetch the rating from the per-asset endpoint (or the parameterised list call that returns it) for the assets on Jubaili contracts only. This is 575 assets, so it runs as its own batched, resumable pass inside the existing sync-time budget, in the same style as device enrichment, rather than a blocking loop.
- Ratings are cached on the asset record so later syncs never blank an existing value; only a newer non-null rating replaces it.

## Step 3 — Name-derived fallback for unrated sites

Many Jubaili sites carry the rating in their name ("Total Logistics Gen 3 250KVA", "Samana Travel 13 KVA", "NILE UNIVERSITY 1000KVA"). Where AMMP has no rating:

- Use the kVA parsed from the site name as a **fallback** rating, so the site is billed instead of dropped.
- Mark that site as **"Rating from name"** in the calculator, contract page and support document, so it is clear the AMMP record still needs fixing.
- Sites with neither an AMMP rating nor a parsable name stay unrated and unbilled, and are listed for follow-up.

## Step 4 — Show kVA and flags in all three views

Once ratings flow through:

- **Contract page — Asset Breakdown** (Jubaili only): new **kVA** and **Band** columns, per-row status flag (Unrated / Rating from name / Clamped / Name mismatch), and a summary strip with rated, unrated, clamped and mismatched counts plus the resulting annual banded total. A warning banner appears while any site is unrated.
- **Invoice calculator**: a counts line (billed / from name / clamped / unrated / mismatched) above the band breakdown, with the problem sites always listed rather than folded away.
- **Support document**: the per-site table gains an explicit **Status** column using the same flags, plus a note under the table stating how many sites were excluded as unrated and how many were clamped, so the totals are explained.

## Technical notes

- Pricing math in `calculateElumJubailiBreakdown` (`src/lib/invoiceCalculations.ts`) is unchanged apart from accepting the new "rating from name" status; bands, clamping and the annual-minimum floor already work.
- `parseKvaFromName` already exists and is reused for the fallback, so the calculator, contract page and support document all derive identical values.
- The contract page reads bands from the contract's `org_pricing_config.jubailiKvaBands` (defaults as fallback) so it never disagrees with the invoice.
- The second Jubaili contract (Elum, 577 assets) picks up the same fix automatically — the change is at package level, not per contract.
- The diagnostic logging from Step 1 is removed once the fetch is confirmed working.
