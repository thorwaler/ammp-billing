

# Hide Inactive Customers from Reports Filter Dropdown

## What changes
In `src/pages/Reports.tsx`, the `fetchCustomers` function (line 93-102) currently fetches all customers. We'll update it to only include customers that have at least one active contract.

## How
Two approaches — the simplest is to fetch contracts alongside customers and filter client-side:

1. **Fetch active contract customer IDs** — query the `contracts` table for `contract_status = 'active'`, select distinct `customer_id`
2. **Filter the customers list** — only include customers whose ID appears in that active-contracts set

This avoids any database changes and keeps it purely in the existing fetch logic.

### File: `src/pages/Reports.tsx` (lines 93-102)

Update `fetchCustomers` to:
1. Fetch customers as before
2. Also fetch distinct `customer_id` values from `contracts` where `contract_status = 'active'`
3. Filter customers to only those with an active contract ID match

```typescript
const fetchCustomers = useCallback(async () => {
  if (!user) return;
  
  const [{ data: customerData }, { data: contractData }] = await Promise.all([
    supabase.from('customers').select('id, name, nickname, status').order('name'),
    supabase.from('contracts').select('customer_id').eq('contract_status', 'active'),
  ]);
  
  const activeCustomerIds = new Set(
    (contractData || []).map(c => c.customer_id)
  );
  
  setCustomers(
    (customerData || []).filter(c => activeCustomerIds.has(c.id))
  );
}, [user]);
```

No other files need changes — the `ReportsFilters` component receives the already-filtered list.

