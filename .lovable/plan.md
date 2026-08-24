# Battery inverter power as a capacity proxy (Elum 2026)

Sites with no usable PV capacity get priced on their battery inverter rating instead of being billed at zero.

## When the proxy applies

Per asset, in this order:

1. PV capacity present and plausible → bill on PV (unchanged).
2. PV capacity missing or 0 → use battery inverter power as the capacity proxy.
3. PV capacity present but flagged unrealistic by the existing capacity sanity check (measured/registered ratio outside 0.3–1.2) → use battery inverter power as the proxy.
4. No battery inverter value either → nothing changes: the site stays at zero and keeps its existing zero-PV / sanity flags, and the UI shows "not set" (never "0 kW").

Scope: Elum 2026 packages only (C&I Light/Pro/Utility, Internal, Portfolio OS, Enterprise eConf, ePM). Jubaili keeps kVA-banded pricing, untouched. Manual per-invoice overrides in the revision dialog continue to win over everything.

## Reading the value from AMMP

`battery_inverter_power` (watts) lives in `asset_specific_params`, which is only populated on the single-asset endpoints — `GET /v1/assets/{id}` and `GET /v1/assets/{id}/devices`. The org list endpoint (`/assets?org_ids=`) always returns it as null.

The sync and device-enrichment functions already fan out one `/assets/{id}/devices` call per asset, so the value is captured there — no extra API calls, no new throttling. The list path must never write null over a previously captured value.

Read defensively: `asset_specific_params` can itself be null, may contain unrelated keys, and is absent from the published OpenAPI spec. Values are watts; divide by 1000 for kW. Do not mix with `genset_capacity` (VA).

## Making "unrealistic PV" persistent

Today the capacity sanity check only raises an alert. It will additionally write its verdict per asset into the contract's cached capabilities (`pvSanity: { verdict, ratio, checkedAt }`), so pricing and support documents can act on the "too_low" / "too_high" result rather than re-running the check. Verdicts older than 90 days are treated as unknown (no proxy triggered from a stale check).

## What changes in invoices and documents

- A shared "effective capacity" resolver returns the MW used for pricing plus its source (`pv`, `battery_inverter`, or `none`). Elum tier, Portfolio OS, Internal, Enterprise eConf and ePM calculations call it instead of reading `totalMW` directly.
- Support documents label proxied sites explicitly, e.g. `300 kW (battery inverter, no usable PV)`, and list them in a short "capacity proxied" note so the customer-facing rationale is visible.
- Zero-PV alerts and battery-only alerts no longer fire for a site that has a working battery proxy; sites with neither PV nor a battery rating keep flagging as before.
- The sanity check skips assets already priced on the battery proxy.

## UI

- Contract details asset table: a battery inverter column showing `x kW` or "not set", and a badge on rows where the proxy is driving the billed capacity.
- Revision dialog: proxied sites appear as resolved rather than as "still zero", and manual overrides remain available for the rest.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts` — extract `asset_specific_params?.battery_inverter_power` in `calculateCapabilities`, store `batteryInverterKW` (W/1000) on the asset breakdown; preserve the cached value when a fetch path cannot supply one.
- `supabase/functions/ammp-device-enrichment/index.ts` — same extraction in `calculateCapabilitiesFromDevices` from the asset envelope returned with `/devices`.
- `supabase/functions/_shared/ammpTypes.ts` — add `batteryInverterKW?: number | null` and `pvSanity?: { verdict, ratio, checkedAt }` to `CachedAssetBreakdown`.
- New `supabase/functions/_shared/effectiveCapacity.ts` and a mirrored `src/lib/effectiveCapacity.ts` implementing the resolution order above.
- `supabase/functions/ammp-capacity-sanity-check/index.ts` — persist verdicts back into `cached_capabilities`; skip battery-proxied assets.
- `supabase/functions/_shared/zeroPvScan.ts` — suppress zero-PV and battery-only alerts where a proxy resolves the capacity.
- `src/lib/invoiceCalculations.ts` — route Elum 2026 per-MWp paths through the resolver.
- `src/lib/supportDocumentGenerator.ts`, `src/components/invoices/SupportDocument.tsx`, `src/components/invoices/PdfRenderer.tsx`, `src/lib/supportDocumentWarnings.ts` — proxy labelling.
- `src/pages/ContractDetails.tsx`, `src/components/invoices/RevisionDialog.tsx` — display and revision handling.

No schema migration is needed; everything rides in `contracts.cached_capabilities`. A contract resync is required after deploy for the new field to appear.
