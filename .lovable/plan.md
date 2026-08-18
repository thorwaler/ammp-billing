# Cleanup pass after yesterday's changes

Reviewed everything touched yesterday (billing-period convention, invoice revision + manual overrides, ignored "zombie" assets, kVA-vs-MWp metric fix). One real defect, plus three tidy-ups.

## 1. Upcoming invoices still uses the old period arithmetic (real bug)

Yesterday's fix established one convention: `period_end === next_invoice_date` and `period_start = previous invoice date + 1 day`, implemented in `periodAfterInvoice()`. The invoice calculator, the merged dialog and invoice deletion all use it — but the upcoming-invoices list still writes the dates by hand in four places (auto-advance of overdue automated contracts, Skip, Skip selected, Mark as sent). Each sets `period_start` to the invoice date itself, so those contracts get the off-by-one period back (e.g. 30 Jun instead of 1 Jul).

Fix: route all four through `periodAfterInvoice(invoice.nextInvoiceDate, frequency, nextDate)` so every path shares the same convention.

## 2. Scheduling helpers imported dynamically inside handlers

`MergedInvoiceDialog` and `InvoiceCalculator` `await import('@/lib/invoiceScheduling')` inside click handlers, sometimes twice in the same function, while also importing the module statically. It adds noise and makes it easy to miss a call site.

Fix: use static imports for `invoiceScheduling` in both files and drop the inline dynamic imports.

## 3. Ignored assets: two caches for one list

The ignore list is held both in a module-level cache in `src/lib/ignoredAssets.ts` (needed by the synchronous PDF renderer) and in a React Query cache in `useIgnoredAssets`. Toggling from the revision dialog updates one, and the support-document warnings read the other, so a freshly ignored site can still show as a warning until a reload.

Fix: keep the module cache as the single store, have the hook write through to it on every fetch and on toggle, and invalidate the query after a toggle so both views agree immediately.

## 4. "Ignored / capacity not set" labels written three times

`SupportDocument.tsx`, `PdfRenderer.tsx` and `supportDocumentWarnings.ts` each re-derive whether a site is ignored, zero-capacity, or fine, with slightly different wording between the screen and PDF versions.

Fix: one small helper (`siteCapacityLabel(site, unit)`) in `supportDocumentWarnings.ts` that both renderers call, so the PDF and the on-screen document always say the same thing.

## Explicitly not changing

- The revision engine's `diffSnapshotAgainstLive` signature (positional ignored-set plus options) stays as is — it is called from one place and works.
- `buildParamsFromContractRow` in `invoiceRevision.ts` overlaps with the calculator's live mapping, but they read from different shapes (frozen snapshot row vs live form state); merging them risks the frozen-total reproduction that was just stabilised.

## Technical notes

- `src/components/invoices/UpcomingInvoicesList.tsx`: replace the four inline `{ next_invoice_date, period_start, period_end }` objects (~L260, ~L458, ~L498, ~L580) with `periodAfterInvoice(...)`.
- `src/components/invoices/MergedInvoiceDialog.tsx` (~L514-577) and `src/components/dashboard/InvoiceCalculator.tsx` (~L1444, ~L1472): static imports.
- `src/lib/ignoredAssets.ts` + `src/hooks/useIgnoredAssets.ts`: write-through cache; invalidate query on toggle.
- `src/lib/supportDocumentWarnings.ts`: add the shared label helper; consume in `SupportDocument.tsx` (~L174, ~L400) and `PdfRenderer.tsx` (~L152, ~L251).
- No database, edge-function or pricing changes; totals stay identical.
