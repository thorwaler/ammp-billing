
# Elum Contract Foundations — 4-part plan

This lays groundwork for the upcoming Elum API changes without touching current package math. All four features are built as **generic capabilities** flagged on/off per contract so the eventual new Elum contract type (and existing variants that opt in) can consume them.

---

## 1. PV Capacity Zero Handling

**Goal:** Assets reporting `total_pv_power = 0` should not silently invoice at full rate. Elum gets a mid-quarter heads-up; if unfixed by invoice time, we substitute an estimated capacity.

### Data
- Add `zero_pv_policy` fields to `contracts`:
  - `zero_pv_alert_enabled boolean` (default false)
  - `zero_pv_estimate_multiplier numeric` (default 1.2)
  - `zero_pv_grace_days integer` (default 30)
- New table `zero_pv_incidents`: `contract_id`, `asset_id`, `asset_name`, `detected_at`, `resolved_at`, `estimated_capacity_mw`, `estimate_source` ("ammp_max_pv_output_365d" | "manual"), `applied_to_invoice_id`.

### Detection & alerts (mid-quarter, 15th)
- Extend `ammp-scheduled-sync` (or new `zero-pv-check` cron): on the 15th of each month, for every contract with `zero_pv_alert_enabled`, scan `cached_capabilities.assets` for `totalMW === 0`.
- Open/refresh a `zero_pv_incidents` row per asset and raise an `invoice_alerts` row (severity `warning`, type `zero_pv_capacity`) listing the affected assets and the deadline (`detected_at + grace_days`).

### Estimation (invoice time)
- New helper `src/lib/zeroPvEstimation.ts`:
  - `getEstimatedCapacityMW(contractId, assetId)` → fetches `pv_energy_out` daily timeseries for the last 365d via `ammp-data-proxy`, takes the peak daily kWh converted to instantaneous kWp, multiplies by `estimate_multiplier`.
  - Results cached on the incident row so repeat invoices don't re-query.
- In `invoiceCalculations.ts`, when computing per-asset MW for a contract with the policy on: substitute `totalMW` with the estimate when zero AND `now - detected_at ≥ grace_days`. Track substitutions and surface them in the returned calc result.
- Support document (`supportDocumentGenerator.ts` + `SupportDocument.tsx`): new "Zero-PV Substitutions" section listing asset, detected date, days elapsed, original 0 MW, estimated MW, source.

---

## 2. Invoice Input Snapshot & 30-day Revision Window

**Goal:** Freeze all inputs used to compute an invoice so we can regenerate deterministically within 30 days if zero-PV incidents get corrected.

### Data
- `invoices` table:
  - `input_snapshot jsonb` — full snapshot: resolved asset list, per-asset MW & capabilities, contract rates at generation time, exchange rate, zero-PV substitutions applied, period bounds.
  - `snapshot_frozen_at timestamptz`
  - `revision_deadline timestamptz` (frozen_at + 30d)
  - `revised_from_invoice_id uuid nullable` — link when a revised invoice supersedes an earlier one.

### Behaviour
- Invoice creation in `InvoiceCalculator.tsx` / `MergedInvoiceDialog.tsx` writes the snapshot alongside the invoice row.
- New "Revise Invoice" action in `InvoiceHistory.tsx` (only visible while `now < revision_deadline`):
  - Reloads calculator prefilled from snapshot but re-queries current zero-PV incidents.
  - On save, marks the original as `revised` and links via `revised_from_invoice_id`; SharePoint doc + Xero draft (if any) replaced via existing delete/upload flow.
- Read-only "Snapshot" tab in invoice detail dialog for auditability.

### Note
This is generic — every new invoice gets a snapshot, so the feature is available for all packages, not just Elum.

---

## 3. Enterprise Annual Minimum (Anniversary True-up)

**Goal:** For Elum-style enterprise contracts, evaluate the annual minimum **once at the anniversary of the first invoice**, not quarterly gap-fill like today's `per_mw_annual_upfront`.

### Data
- `contracts`:
  - `annual_minimum_mode text` — `"quarterly_gap"` (current behaviour) | `"anniversary_trueup"` (new).
  - `first_invoice_date timestamptz` — set on first invoice; used as anniversary anchor.
  - Re-use existing `annual_minimum_fee` and `ytd_invoiced_amount`.

### Behaviour
- On first invoice for a contract, set `first_invoice_date` if null.
- `invoiceScheduling.ts`: extend `getNextInvoiceDate` so `anniversary_trueup` contracts schedule the true-up on `first_invoice_date + N years`, independent of the quarterly per-MW cadence.
- `invoiceCalculations.ts`: when `annual_minimum_mode = 'anniversary_trueup'` and the invoice date matches the anniversary, compute `max(0, annual_minimum_fee − ytd_invoiced_amount_for_year)` as a "Annual Minimum True-up" line. Reset `ytd_invoiced_amount` post-invoice.
- Quarterly per-MW invoices in between are unchanged and continue to increment YTD.
- Support document gets an "Annual Minimum Reconciliation" block for anniversary invoices.

---

## 4. Inflation Cap + 200-day Anniversary Notice

**Goal:** Cap yearly price increases at ECB HICP 6-month average and warn Elum 200 days before each contract anniversary.

### Data
- `contracts`:
  - `inflation_cap_enabled boolean`
  - `anniversary_notice_days integer` (default 200)
  - `last_anniversary_notice_sent_at timestamptz`
- New table `inflation_reference_rates`: `month`, `source` ("ecb_hicp"), `rate_pct`, cached monthly.

### Reference fetch
- New edge function `fetch-ecb-inflation` (daily cron): pulls latest 6 months of Eurozone HICP annualized rate from ECB SDW public API and upserts into `inflation_reference_rates`. Compute rolling 6-month average on read.

### Anniversary notice
- Daily job (fold into existing `ammp-scheduled-sync` daily run or new cron): for each `inflation_cap_enabled` contract, if `today = anniversary − anniversary_notice_days` and no notice sent this cycle, create an `invoice_alerts` row (severity `info`, type `price_increase_notice`) containing: contract, anniversary date, current rates, 6-month ECB average, capped-max new rate. Stamp `last_anniversary_notice_sent_at`.
- Alert UI (`AlertCard.tsx`) already renders arbitrary alert types — just add the copy/icon mapping.

### Enforcement
- Not automatic. The alert tells the operator the max allowed increase; actual price edits stay manual in the contract form. Form shows an inline warning when a rate change exceeds the cap since the last anniversary.

---

## Technical section

### Files touched
- Migrations: new columns on `contracts` and `invoices`; new tables `zero_pv_incidents`, `inflation_reference_rates`. GRANTs + RLS per project convention (user-scoped through existing `*_user_unchanged` helper pattern).
- New files:
  - `src/lib/zeroPvEstimation.ts`
  - `src/lib/invoiceSnapshot.ts` (build + restore snapshot)
  - `src/lib/inflationCap.ts`
  - `supabase/functions/fetch-ecb-inflation/index.ts`
  - Optional `supabase/functions/zero-pv-check/index.ts` (or reuse ammp-scheduled-sync)
- Edited: `src/lib/invoiceCalculations.ts`, `src/lib/invoiceScheduling.ts`, `src/lib/supportDocumentGenerator.ts`, `src/components/invoices/SupportDocument.tsx`, `src/components/invoices/InvoiceCalculatorDialog.tsx`, `src/components/invoices/MergedInvoiceDialog.tsx`, `src/pages/InvoiceHistory.tsx`, `src/components/contracts/ContractForm.tsx`, `src/utils/invoiceAnomalyDetection.ts`.

### Cron
- ECB fetch: daily 04:00 UTC.
- Zero-PV check: monthly on the 15th at 06:00 UTC.
- Anniversary notice: piggy-back on the daily AMMP sync.

### Rollout order
1. Migrations (schema first).
2. Snapshot writing (harmless — starts populating for all new invoices).
3. Zero-PV detection + alerts (read-only detection first, then estimator).
4. Anniversary minimum mode + scheduling.
5. Inflation reference + notice.

### Out of scope
- The new Elum contract type UI/pricing itself — waiting on the upcoming API. These features expose the toggles it will consume.
- Automatic re-pricing enforcement.
- Backfilling snapshots for historical invoices.
