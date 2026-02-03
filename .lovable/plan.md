

## Fix: Exclusion Asset Group Filter Not Working

### Problem Summary
The BLS Project Management contract has an exclusion filter (`ammp_asset_group_id_not`) set to exclude assets from the "BLS Asset Management" group, but these assets are still appearing in the contract's asset breakdown.

**Root Cause**: The sync logic in `ammp-sync-contract` only applies AND and NOT filters when a primary asset group is set. When using org-based filtering (no primary group), exclusion filters are completely ignored.

### Current Logic (Broken)
```
if (contract.ammp_asset_group_id) {
  // Uses primary group + applies AND + NOT filters
} else if (orgId) {
  // Gets all org assets - IGNORES AND/NOT filters!
}
```

### BLS Project Management Contract Configuration
- Package: `hybrid_tiered_assetgroups`
- Primary Group: `null` (not set)
- Exclusion Group: `d90d6011-e0dc-471b-9bc2-20684df97d4b`
- Org ID: `b7a27d6b-2010-4538-a9b6-500f61ebb904`
- Result: All 167 org assets synced, no exclusion applied

---

### Solution

Modify the `ammp-sync-contract` edge function to apply AND and NOT filters even when using org-based filtering (no primary asset group).

---

### Technical Details

#### File: `supabase/functions/ammp-sync-contract/index.ts`

**Current logic (lines 316-341)**:
```typescript
if (contract.ammp_asset_group_id) {
  // Primary group filtering + AND/NOT filters
  ...
} else if (orgId) {
  // Org filtering - NO asset group filters
  const orgAssets = allAssets.filter((a: any) => a.org_id === orgId);
  assetsToProcess = orgAssets.map(...);
}
```

**Fixed logic**:
```typescript
if (contract.ammp_asset_group_id) {
  // Primary group filtering
  const primaryMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id);
  assetsToProcess = [...primaryMembers];
  
  // Apply AND filter
  if (contract.ammp_asset_group_id_and) {
    const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
    const andIds = new Set(andMembers.map(m => m.asset_id));
    assetsToProcess = assetsToProcess.filter(m => andIds.has(m.asset_id));
  }
  
  // Apply NOT filter
  if (contract.ammp_asset_group_id_not) {
    const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
    const notIds = new Set(notMembers.map(m => m.asset_id));
    assetsToProcess = assetsToProcess.filter(m => !notIds.has(m.asset_id));
  }
} else if (orgId) {
  // Org-based filtering
  const orgAssets = allAssets.filter((a: any) => a.org_id === orgId);
  assetsToProcess = orgAssets.map((a: any) => ({ asset_id: a.asset_id, asset_name: a.asset_name }));
  
  // NEW: Apply AND filter for org-based contracts too
  if (contract.ammp_asset_group_id_and) {
    const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
    const andIds = new Set(andMembers.map(m => m.asset_id));
    assetsToProcess = assetsToProcess.filter(m => andIds.has(m.asset_id));
    console.log(`[AMMP Sync Contract] AND filter applied: ${assetsToProcess.length} assets remain`);
  }
  
  // NEW: Apply NOT filter for org-based contracts too
  if (contract.ammp_asset_group_id_not) {
    const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
    const notIds = new Set(notMembers.map(m => m.asset_id));
    assetsToProcess = assetsToProcess.filter(m => !notIds.has(m.asset_id));
    console.log(`[AMMP Sync Contract] NOT filter applied: ${assetsToProcess.length} assets remain`);
  }
  
  console.log(`[AMMP Sync Contract] Org ${orgId} filtering: ${assetsToProcess.length} assets`);
}
```

---

### Expected Result

After implementation:
1. Deploy the updated edge function
2. Re-sync the BLS Project Management contract
3. Assets in the exclusion group (BLS Asset Management) will be filtered out
4. Asset count should decrease from 167 to the correct filtered count

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/ammp-sync-contract/index.ts` | Add AND/NOT filter logic to the org-based filtering branch |

