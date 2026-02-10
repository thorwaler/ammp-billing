

## Add Quarter-by-Quarter Comparison for MW and Revenue

### Overview
Add a new section to the Reports page with two side-by-side charts that show quarter-by-quarter comparisons for MW growth and revenue. Customer filters will be respected.

### Data Aggregation Approach
Reuse the existing monthly data (`mwGrowthData` and `arrNrrData`) already fetched on the Reports page. Aggregate it into calendar quarters (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec) on the frontend -- no new database queries needed.

### Quarter Format
Quarters will be labeled as `Q1 2025`, `Q2 2025`, etc.

### Charts
1. **MW by Quarter** -- Grouped bar chart showing MW added per quarter, with a line overlay for cumulative MW at quarter end.
2. **Revenue by Quarter** -- Stacked bar chart showing ARR and NRR per quarter (consistent with the existing monthly ARR vs NRR chart).

### Technical Changes

#### File: `src/pages/Reports.tsx`

1. Add two helper functions to aggregate monthly data into quarters:
   - `aggregateMWByQuarter(mwGrowthData)` -- groups monthly MW into quarters, sums `mw` per quarter, takes last `cumulativeMW` in each quarter.
   - `aggregateRevenueByQuarter(arrNrrData)` -- groups monthly ARR/NRR into quarters, sums `arr`, `nrr`, and `total` per quarter.

2. Add two new state variables for the quarterly data (derived via `useMemo` from existing monthly state).

3. Add a new row of two chart cards below the existing "ARR vs NRR by Month" and "MW Growth Over Time" charts:
   - "MW by Quarter" -- BarChart with bars for MW added and a line for cumulative MW
   - "Revenue by Quarter" -- Stacked BarChart with ARR and NRR bars

No changes to `dashboardAnalytics.ts` -- all aggregation happens client-side from already-fetched monthly data.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Reports.tsx` | Add quarterly aggregation helpers and two new chart cards |

