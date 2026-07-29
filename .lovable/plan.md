## Problem

The new C&I Light contract (`elum_tier = ci_lite`, parent org `06a3…65ac`, no asset group, no `ammp_org_id`) sits at `never_synced` with 0 cached assets.

Today the sync (`supabase/functions/ammp-sync-contract/index.ts`) resolves Elum org-tier assets by fetching one global `/assets` list and filtering in memory on `a.org_id`. That only works if the global list contains every sub-org's assets *and* carries a populated `org_id`. Instead we should do what you describe: discover tier-flagged sub-orgs, then ask the assets endpoint scoped to those org IDs.

## API calls used

```text
GET /v1/orgs?parent_org_id=<PARENT_ORG_ID>          # sub-org discovery + feature_flags
GET /v1/assets?org_ids=<SUB_ORG_ID>                 # assets for a tier-flagged sub-org
GET /v1/assets/<ASSET_ID>/devices?include_virtual=true   # per-asset device enrichment
```

All go through the existing `ammp-data-proxy` (base `https://data-api.ammp.io/v1`), so no new proxy work beyond confirming the query string passes through untouched.

## What to change

**1. Per-sub-org asset fetching (edge function)**

Add `getAssetsForOrgs(token, orgIds)` calling `/assets?org_ids=<id>` (one call per sub-org; batch comma-separated only if the endpoint accepts it, otherwise sequential with small concurrency). Normalise array or `{assets: []}` responses to `{asset_id, asset_name, org_id}`.

In the Elum org-tier branch of `processContractSync`:
- fetch assets per tier-matched sub-org and merge, de-duplicating by `asset_id`;
- build `assetOrgMap` from the org the asset was fetched under, not from `a.org_id`;
- merge fetched rows into `assetLookup` so device enrichment keeps using `/assets/<id>/devices?include_virtual=true` and skips redundant metadata calls;
- if a scoped call errors or returns nothing, fall back to filtering the global `/assets` list by `org_id` for that org, and log which path was used.

Legacy asset-group merge, double-count warnings and `unassignedOrgs` behaviour stay unchanged.

**2. Diagnostics**

Log per sub-org: name, tier, asset count, resolution path. When a tier has sub-orgs but resolves zero assets, fail loudly with `"No assets found for N C&I Light sub-orgs"` rather than writing a silent empty sync.

**3. Client parity**

`src/services/ammp/dataApiClient.ts`: `listAssets(orgIds?: string[])` → `/assets?org_ids=…`, so form-side discovery/preview uses the same call.

**4. Verify**

Redeploy, sync this contract, confirm `cached_capabilities.assetBreakdown` and `orgBreakdown` populate per sub-org and the C&I Light €65/MWp calculation yields a non-zero preview.
