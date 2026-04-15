

# Make PDF Support Documents Searchable

## Problem
The PDF support documents are generated using `html2canvas` + `jsPDF`, which renders the entire document as a raster image embedded in a PDF. This means text cannot be selected, searched, or copied — the "Find" function (Ctrl+F) doesn't work.

This affects both paths:
- **Download dialog** (`exportToPDF` in `supportDocumentExport.ts`) — uses `window.print()` which does produce searchable text, but opens a print dialog instead of directly downloading
- **Xero attachment** (`renderSupportDocumentToPdf` in `PdfRenderer.tsx`) — uses `html2canvas` → image-only PDF, completely non-searchable

## Solution
Replace `html2canvas` + `jsPDF` with `jsPDF` text-based rendering that writes actual text, lines, and rectangles directly to the PDF. This produces real, searchable PDF text.

### Approach: Rewrite `PdfRenderer.tsx` to use jsPDF's text API

Instead of capturing a screenshot, we'll build the PDF programmatically using `jsPDF` methods (`text()`, `line()`, `rect()`, `autoTable` plugin) to lay out the same content from the `SupportDocumentData` object.

### Files to modify

1. **`src/components/invoices/PdfRenderer.tsx`** — Complete rewrite:
   - Remove `html2canvas` dependency and React rendering approach
   - Use `jsPDF` with `jspdf-autotable` plugin to render tables natively
   - Build each section (header, year overview, asset breakdown, solcast, addons, retainer, totals) as native PDF text and tables
   - Keep the same function signature (`renderSupportDocumentToPdf(data) → base64`)

2. **`src/lib/supportDocumentExport.ts`** — Update `exportToPDF`:
   - Replace the `window.print()` approach with a direct call to the new jsPDF-based renderer
   - This gives a direct download (no print dialog) with searchable text

3. **`src/lib/pdfGenerator.ts`** — Remove or simplify:
   - Remove `html2canvas` usage since it's no longer needed
   - Redirect to the new renderer or mark as deprecated

4. **`src/components/invoices/SupportDocumentDownloadDialog.tsx`** — Minor update:
   - Remove the hidden `<SupportDocument>` div (no longer needed for PDF rendering since we build from data directly)

5. **`src/components/invoices/InvoiceCalculatorDialog.tsx`** — Minor update:
   - Remove the hidden `<SupportDocument>` div used for PDF rendering

### New dependency
- `jspdf-autotable` — jsPDF plugin for rendering tables with headers, borders, and pagination. Already works with the existing `jspdf` package.

### What stays the same
- `SupportDocument.tsx` React component — still used for on-screen preview
- `SupportDocumentData` interface — the data source for PDF generation
- All function signatures and call sites in `InvoiceCalculator.tsx` and `MergedInvoiceDialog.tsx`

## Technical details
- The new renderer reads from `SupportDocumentData` directly (no DOM needed)
- Tables use `autoTable` for proper pagination, borders, and alignment
- Text is real PDF text — fully searchable with Ctrl+F in any PDF viewer
- The Xero attachment flow continues to receive a base64 string as before

