

## Clear Cache and Re-sync Solarsaver

### Steps

**1. Clear cached data for the Solarsaver contract** (`e993a262-379a-4e5a-a411-70ab75b2929e`)
- Set `cached_capabilities` to `null`
- Set `ammp_sync_status` to `'never_synced'`
- Set `last_ammp_sync` to `null`

This is a data update using the insert tool (UPDATE statement).

**2. Re-trigger sync**
After the cache is cleared, you can click the "Sync" button on the contract page to re-fetch all asset data from AMMP fresh — including device enrichment for Solcast detection.

### Technical Detail

| # | Action | Detail |
|---|--------|--------|
| 1 | UPDATE query | Clear `cached_capabilities`, `ammp_sync_status`, `last_ammp_sync` on contract `e993a262-...` |
| 2 | UI action | Click sync from the contract details page to re-populate data |

No code changes needed — just a data reset followed by a manual sync.

