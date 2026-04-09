

# Move Contract to Another Customer

## What it does
Adds a "Move to Customer" option in the contract details dropdown menu (the `...` menu). When clicked, it opens a dialog where the user selects a target customer from a dropdown list, confirms the move, and the contract's `customer_id` and `company_name` are updated accordingly.

## Implementation

### File: `src/pages/ContractDetails.tsx`

1. **Add state** for the move dialog: `showMoveDialog` (boolean) and `moveTargetCustomerId` (string).

2. **Add a `handleMoveContract` function** that:
   - Fetches the target customer's name from the customers table
   - Updates the contract's `customer_id` and `company_name` to match the target customer
   - Shows a success toast and reloads contract data

3. **Add a "Move to Customer" `DropdownMenuItem`** in the existing dropdown menu (after the status change options, before Clear AMMP Data). It opens a confirmation dialog with:
   - A `Select` dropdown listing all customers (fetched on dialog open), excluding the current customer
   - A confirmation button that calls `handleMoveContract`

4. **Import** `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from the UI components, and add the `ArrowRightLeft` icon from lucide-react.

### No database changes needed
The `contracts` table already has `customer_id` and `company_name` columns. The update just changes which customer the contract belongs to.

