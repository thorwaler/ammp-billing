## Goal
When an invoice is deleted from Invoice History, also remove its associated support document(s) from the connected SharePoint/OneDrive folder so duplicates don't pile up when invoices are regenerated.

## Approach

**1. Persist the SharePoint file reference on the invoice**
- Add two columns to `invoices`:
  - `sharepoint_file_id` (text)
  - `sharepoint_drive_id` (text)
- For merged invoices, add `sharepoint_files` (jsonb) storing an array of `{ driveId, fileId, fileName }` so multiple docs can be tracked.

**2. Save the reference at upload time**
- In `InvoiceCalculator.tsx`: after `uploadToSharePoint` returns `success`, update the just-created invoice row with `sharepoint_file_id` / `sharepoint_drive_id` (already returned by the edge function).
- In `MergedInvoiceDialog.tsx`: after `uploadMultipleToSharePoint`, save the collected `{driveId, fileId, fileName}` array into `sharepoint_files` on the merged invoice.
- Update `sharePointUpload.ts` return type so callers get `driveId` alongside `fileId` (the folder setting already knows the driveId — return it).

**3. New edge function `sharepoint-delete-document`**
- Accepts `{ driveId, fileId }`.
- Reuses the same `getValidAccessToken` pattern as `sharepoint-upload-document`.
- Calls `DELETE https://graph.microsoft.com/v1.0/drives/{driveId}/items/{fileId}`.
- Treats 404 as success (already gone).
- Returns `{ success: true }` or an error.

**4. Client helper `deleteFromSharePoint(driveId, fileId)`**
- Added to `src/utils/sharePointUpload.ts`.
- Skips gracefully if SharePoint connection is missing/disabled (same guard pattern as upload).

**5. Wire deletion into `handleDeleteInvoice` (InvoiceHistory.tsx)**
- Before deleting the invoice row, read `sharepoint_file_id`/`sharepoint_drive_id` (and `sharepoint_files` for merged).
- Fire `deleteFromSharePoint` calls in parallel (`Promise.allSettled`) — non-blocking on failures, just toast a warning if any fail.
- Continue with existing deletion logic (Xero void, prepaid balance reversal, DB delete).

## Not doing
- No backfill for existing invoices already uploaded — only newly created invoices will have the reference stored and be auto-deletable. Older docs remain until manually cleaned. (Happy to add a one-off "match by filename" fallback if you want — let me know.)
