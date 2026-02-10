

## Add "Invoiced" Label to Invoice-Based Report Titles

### Overview
Update chart and card titles on the Reports page to clearly indicate which metrics are based on actual invoiced data, distinguishing them from contract-based or forecast metrics.

### Changes (single file: `src/pages/Reports.tsx`)

The following titles will be updated:

| Current Title | New Title |
|---|---|
| ARR vs NRR by Month | Invoiced ARR vs NRR by Month |
| Revenue by Customer | Invoiced Revenue by Customer |
| Revenue by Quarter | Invoiced Revenue by Quarter |
| Actual vs Projected Revenue | Actual vs Projected Invoiced Revenue |

### Titles that stay unchanged (not invoice-based)
- Contract ARR (contract-based)
- Invoice ARR / Invoice NRR KPI cards (already labelled)
- ARR by Customer (Contract Values) (contract-based)
- Revenue Forecast (projection-based)
- MW Growth Over Time, Customer Growth, MWp by Customer, MW by Quarter (non-revenue)

### Technical Details
- Only string changes to `CardTitle` text in `src/pages/Reports.tsx`
- No logic or data changes required

