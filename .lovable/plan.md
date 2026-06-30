## Fix: Customer not changing on Contracts page after a move

### Root cause

`contracts.company_name` is a denormalized snapshot used by the contracts list (and the form's Company field). `MoveContractDialog` updates only `contracts.customer_id`, so the row keeps its old `company_name` and appears unchanged in the list — even though the underlying `customer_id` has switched.

### Change

In `src/components/contracts/MoveContractDialog.tsx`:

- When the user confirms a move, update both fields in the same `contracts` update:
  - `customer_id = selectedCustomerId`
  - `company_name = <selected customer's name>` (use the official `name`, not nickname, to match how `company_name` is captured on create/edit)
- Keep the existing toast + `onMoved()` callback (which already triggers `loadContracts()` in `ContractList`).

No other tables need touching — `company_name` is the only denormalized field on `contracts`; everything else joins via `customer_id`.

### Files touched

- `src/components/contracts/MoveContractDialog.tsx` — extend the update payload with `company_name`.
