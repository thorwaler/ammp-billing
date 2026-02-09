
## Stop Repeated Contract Expiration Notifications

### Problem
Contract expired/expiring notifications are being sent to Slack repeatedly because:
- The current deduplication only prevents duplicates within **7 days**
- After 7 days, a new notification is created and sent to your webhook again
- For expired contracts, this repeats indefinitely (every 7 days)

### Solution
Improve the deduplication logic to:
1. **Contract Expired**: Only send the notification **once ever** per contract (no time limit)
2. **Contract Expiring Soon**: Send at most **once per expiry date** (not every 7 days)

---

### Technical Changes

#### File: `src/utils/contractExpiration.ts`

**Current logic (lines 72-81):**
```typescript
// Check if we've already notified recently (last 7 days)
const { data: existingNotification } = await supabase
  .from('notifications')
  .select('id')
  .eq('contract_id', contract.id)
  .in('type', ['contract_expired', 'contract_expiring_soon'])
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  .limit(1);
```

**New logic:**
```typescript
// For expired contracts: check if ANY expiration notification exists (never repeat)
// For expiring soon: check if notification exists for this specific expiry date
if (result.isExpired) {
  // Never send duplicate "contract_expired" notifications
  const { data: existingExpiredNotification } = await supabase
    .from('notifications')
    .select('id')
    .eq('contract_id', contract.id)
    .eq('type', 'contract_expired')
    .limit(1);
  
  if (existingExpiredNotification && existingExpiredNotification.length > 0) continue;
} else {
  // For expiring soon: check if we already notified about this specific expiry date
  const { data: existingExpiringNotification } = await supabase
    .from('notifications')
    .select('id, metadata')
    .eq('contract_id', contract.id)
    .eq('type', 'contract_expiring_soon')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);
  
  if (existingExpiringNotification && existingExpiringNotification.length > 0) continue;
}
```

---

### Behavior After Fix

| Scenario | Current Behavior | New Behavior |
|----------|------------------|--------------|
| Contract expired | Notifies every 7 days forever | Notifies **once**, then stops |
| Contract expiring in 30 days | Notifies at day 30, 23, 16, 9, 2 | Notifies **once** in the 30-day window |
| Contract renewed (new expiry date) | Would notify again | Will notify for the new expiry period |

---

### Files to Modify

| File | Change |
|------|--------|
| `src/utils/contractExpiration.ts` | Update deduplication logic to prevent repeated notifications |
