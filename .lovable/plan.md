
Goal:
Enable shared/team editing for existing contracts, invoices, and customers in preview mode for any manager/admin, without opening inserts/deletes more broadly and without allowing ownership to be silently reassigned.

Plan:
1. Update RLS for team-wide edits
- Change the UPDATE policies on:
  - `public.contracts`
  - `public.invoices`
  - `public.customers`
- Replace the current owner-only rule:
  - `auth.uid() = user_id AND can_write(auth.uid())`
- With team-write access for managers/admins:
  - `USING (public.can_write(auth.uid()))`
- Keep INSERT policies owner-based as they are now.
- Keep DELETE policies unchanged for now, since the request is about editing, not deleting.

2. Prevent ownership reassignment
- Add small security-definer helper functions that verify a row’s existing `user_id` matches the `user_id` being written for:
  - contracts
  - invoices
  - customers
- Use those in each UPDATE policy’s `WITH CHECK` so managers/admins can edit any row, but cannot change its owner.
- This keeps the simpler team-edit behavior while avoiding accidental or unsafe `user_id` rewrites.

3. Fix the customer edit UI
- Update `src/components/customers/CustomerForm.tsx`:
  - remove `.eq('user_id', user.id)` from the update path
  - do not include `user_id` in the update payload when editing an existing customer
  - keep `user_id: user.id` only for new customer inserts
- This is required, otherwise shared edits will still fail or try to transfer ownership.

4. Fix the contract edit UI
- Update `src/components/contracts/ContractForm.tsx`:
  - stop using one `upsert` payload with `user_id` for both create and edit
  - split create vs update behavior
  - on create: keep `user_id: user.id`
  - on update: send only editable contract fields, not `user_id`
- This avoids ownership reassignment when another manager edits an existing contract.

5. Verify invoice flows against the relaxed policy
- Existing invoice update paths should work once RLS is relaxed, since the main issue is owner-based UPDATE blocking shared edits.
- Re-check these flows after the policy change:
  - `src/components/dashboard/InvoiceCalculator.tsx`
  - `src/components/invoices/UpcomingInvoicesList.tsx`
  - `src/components/invoices/MergedInvoiceDialog.tsx`
  - `src/pages/InvoiceHistory.tsx`
- Most invoice inserts can remain unchanged, since they create new rows owned by the acting user.

Expected result:
- Any manager/admin can edit existing contracts, customers, and invoices in shared/preview mode.
- New records still belong to the user who creates them.
- Ownership is not accidentally changed during edits.
- Contract invoice-date updates, customer status/last-invoiced updates, and invoice edits stop failing due to owner-based RLS.

Technical details:
- Best migration shape:
  - add 3 helper functions:
    - `public.contract_user_unchanged(_id uuid, _user_id uuid)`
    - `public.customer_user_unchanged(_id uuid, _user_id uuid)`
    - `public.invoice_user_unchanged(_id uuid, _user_id uuid)`
  - recreate the 3 UPDATE policies with:
    - `USING (public.can_write(auth.uid()))`
    - `WITH CHECK (public.can_write(auth.uid()) AND public.<table>_user_unchanged(id, user_id))`
- No auth flow changes needed.
- This does not change backend functions that explicitly filter by `user_id`; those would still need separate follow-up if you want shared execution there too.
