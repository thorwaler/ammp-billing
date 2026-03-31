

## Fix: Auto-loop Device Enrichment Until All Batches Complete

### Problem
The device enrichment function processes one batch of 50 assets per call. For large contracts (e.g., Solarsaver with 968 assets), users must click the button ~20 times manually.

### Solution
Two changes:

**1. Edge Function (`supabase/functions/ammp-device-enrichment/index.ts`)**
After the first batch completes and there are remaining assets, use `EdgeRuntime.waitUntil()` to automatically continue processing subsequent batches in the background — same pattern used by `ammp-sync-contract`. The initial response returns immediately with progress info while background processing continues.

**2. Client (`src/pages/ContractDetails.tsx` — `handleEnrichDevices`)**
Instead of returning after one call and showing "click again to continue", add a loop:
- Call the enrichment function
- If `data.complete === false` and `data.remaining > 0`, automatically call again
- Show a progress toast updating the count
- Stop when `complete === true` or an error occurs
- Add a small delay between calls to avoid hammering

```typescript
const handleEnrichDevices = async (forceRecalculate = false, forceRefetch = false) => {
  if (!contract) return;
  setIsEnrichingDevices(true);
  
  try {
    let complete = false;
    let totalEnriched = 0;
    let iteration = 0;
    
    while (!complete) {
      iteration++;
      const { data, error } = await supabase.functions.invoke('ammp-device-enrichment', {
        body: { contractId: contract.id, batchSize: 50, forceRecalculate, forceRefetch }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      // forceRecalculate is a single-pass operation
      if (forceRecalculate) { complete = true; /* show toast */ break; }
      
      totalEnriched += data.enriched || 0;
      complete = data.complete;
      
      // Progress toast (update, don't stack)
      toast({
        title: "Enriching device data...",
        description: `Processed ${totalEnriched} assets. ${data.remaining || 0} remaining...`,
      });
      
      if (!complete) {
        await new Promise(r => setTimeout(r, 1000)); // 1s pause between batches
      }
    }
    
    // Final success toast
    toast({ title: "Device enrichment complete", description: `All assets enriched.` });
    loadContractData();
  } catch (error) { /* error toast */ }
  finally { setIsEnrichingDevices(false); }
};
```

### Files Changed

| File | Change |
|------|--------|
| `src/pages/ContractDetails.tsx` | Replace single-call `handleEnrichDevices` with auto-looping version that continues until `complete === true` |

The edge function already correctly processes one batch and reports `remaining` — no server-side changes needed. The client just needs to loop.

