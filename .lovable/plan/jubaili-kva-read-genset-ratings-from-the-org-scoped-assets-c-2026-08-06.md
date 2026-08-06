# Jubaili kVA: read genset ratings from the org-scoped assets call

## What the data shows

The Jubaili contract (Elum SAS, 575 sites) synced successfully this morning, but **no cached asset carries a genset rating** — the field is absent from every stored asset record, which is why all 575 sites report "no genset rating" and nothing is billed.

Cause: the sync resolves Jubaili assets through the global `GET /assets` response (10,806 assets) and the asset-group members call. `genset_capacity` is only returned by the org-scoped call, `GET /v1/assets?org_ids=<ORG_ID>`, so the rating never enters the pipeline.

## The fix

For Jubaili contracts, fetch the ratings from the org-scoped endpoint once per sync:

1. Call `GET /v1/assets?org_ids=<contract org id>` (for this contract: the Jubaili org already stored on it).
2. Build a lookup keyed by `asset_id` holding the raw `genset_capacity`.
3. Wherever a single site's rating is needed, read it from that lookup — never from a per-asset details call.

Rules applied consistently:

- `genset_capacity` is in volt-amps: kVA = value ÷ 1000, displayed rounded (whole kVA, one decimal only when below 10).
- `null` means **not set** and stays null — it is never coerced to 0. A genuine 0 is a distinct, separately reported case.
- A rating already cached is never blanked by a later sync that fails to return one; only a newer non-null value replaces it.
- Sites in the asset group that the org call does not return keep a null rating and are listed as such.

## Site name is for alerting only

Many site names embed a rating ("Total Logistics Gen 3 250KVA", "NILE UNIVERSITY 1000KVA"). Names are **never** used to price a site. They are only compared against the AMMP value to raise data-quality flags:

- Name says a rating but AMMP has none → "Rating missing in AMMP (name suggests N kVA)".
- Name and AMMP differ materially (more than 20%) → "Name/AMMP mismatch"; the site is still billed on the AMMP value.

Sites with no AMMP rating are not billed and are listed for follow-up, as today.

## Where it shows up

- **Contract page — asset breakdown** (Jubaili only): kVA and band columns, per-row status (Rated / Not set in AMMP / Zero rating / Clamped / Name mismatch), and a counts summary with the resulting annual banded total.
- **Invoice calculator**: counts line (billed / not set / zero / clamped / mismatched) above the band breakdown, with the problem sites listed.
- **Support document**: per-site status column plus a note stating how many sites were excluded for a missing rating and how many were clamped, so the totals reconcile.
- **Alerts**: one data-quality alert per sync summarising missing ratings, mismatches and clamped sites.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts`: for `elum_jubaili`, add an org-scoped `/assets?org_ids=...` fetch and a `Map<asset_id, genset_capacity>`; the capability mapper reads `gensetKVA` from that map (`/1000`, null preserved) instead of the global asset record. No per-asset detail calls are added.
- Banding, clamping and the €20,000 annual minimum in `calculateElumJubailiBreakdown` (`src/lib/invoiceCalculations.ts`) already work and stay as they are; only the site status values change (`rated` / `unset` / `zero` / `clamped` / `mismatch`).
- `parseKvaFromName` stays, but is used solely to produce the alert flags — it never feeds a price.
- One re-sync of each Jubaili contract populates the ratings; until then the existing "sync required" notice stands.
- The second Jubaili contract picks the change up automatically — it is package-level, not per contract.
