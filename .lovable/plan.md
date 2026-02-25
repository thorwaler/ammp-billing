

## Populate the Quarterly Overview Section

The "Quarterly Overview" section on the dashboard (lines 171-187 of `src/pages/Index.tsx`) currently renders only a heading and an empty placeholder. The Invoice Calculator sits alone in the right column.

### What to Add

Fill the `xl:col-span-2` placeholder with two small charts showing quarter-to-date performance:

1. **MW Growth Chart** (bar chart) -- Monthly MW added during the current quarter, using `getMWGrowthByMonth()` filtered to the current quarter date range. Shows which months contributed new MW capacity.

2. **Invoiced Revenue Chart** (bar chart) -- Monthly invoiced revenue during the current quarter, fetched from the `invoices` table grouped by month. Labeled as "Invoiced Revenue" to distinguish from forecasts.

Both charts use the existing `recharts` library and `ChartContainer`/`ChartTooltip` components already in the project.

### Technical Details

#### `src/pages/Index.tsx`

1. **Import** `getMWGrowthByMonth` from `dashboardAnalytics` and chart components (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent` from `@/components/ui/chart`), plus `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid` from `recharts`.

2. **Add state and fetch** for quarterly MW growth and quarterly invoiced revenue. Filter both to the current quarter date range (already computed as `startOfQuarter`/`endOfQuarter`).

3. **For invoiced revenue**, query the `invoices` table for `invoice_date` within the quarter, group by month client-side (similar pattern to `getMWGrowthByMonth`), and sum `invoice_amount_eur` (or `invoice_amount` as fallback).

4. **Replace the placeholder div** (line 181-183) with a two-column grid containing the two chart cards:

```text
+-----------------------------+-----------------------------+
|  MW Added This Quarter      |  Invoiced Revenue (Q1)      |
|  [Bar Chart by Month]       |  [Bar Chart by Month]       |
+-----------------------------+-----------------------------+
```

Each chart card uses `Card`/`CardHeader`/`CardContent` with a `ChartContainer` wrapping a `BarChart`. If no data exists for the quarter, show a subtle "No data yet" message.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Add quarterly MW growth and revenue charts in the placeholder area; add data fetching logic using existing analytics functions and invoice queries |

### Summary

This gives the quarterly overview section real, useful content that leverages the analytics infrastructure already built, without duplicating the detailed Reports page -- it's a quick at-a-glance view of the current quarter's progress.

