## Problem

The annual floor uses a stored `committed_minimum_mw` field, which is 0 on this contract. Result:
- `committedMinimumFloor = 0 × €1,250 = €0`
- Line label says "committed 0 MW"

The user wants the floor's MW-based component to use the **live AMMP-synced MW for this contract** (the same `adjustedTotalMW` already computed for everything else from `cached_capabilities` + asset-group filters), not the contract field.

## Fix

### 1. `src/lib/invoiceCalculations.ts` (per_mw_annual_upfront branch, ~line 1239)

Replace:
```ts
const committedMinimumFloor = (params.committedMinimumMW || 0) * perMWpRate;
```
with the synced MW × rate:
```ts
// Floor's MW-based component uses live AMMP-synced MW (adjustedTotalMW),
// not a static committed value on the contract.
const mwBasedFloor = adjustedTotalMW * perMWpRate;
const annualFloor = Math.max(fixedAnnualMinimum, mwBasedFloor);
```

Update the result breakdown name to reflect the new meaning. Rename `committedMinimumFloor` → `mwBasedFloor` in the `perMWAnnualUpfrontBreakdown` shape (`invoiceCalculations.ts` interface + the assignment around line 1281). Keep `committedMinimumMW` removed from output (or set to `adjustedTotalMW` for display).

### 2. `src/components/dashboard/InvoiceCalculator.tsx` (~line 1041–1050)

Change line item description so it reads from synced MW instead of `selectedCustomer.committedMinimumMW`:
```ts
const syncedMW = Number(mwManaged) || 0;
const desc = `Annual Platform Fee — Minimum (max of synced ${syncedMW.toFixed(2)} MW × ${rateDisplay} = ${currencySymbol}${b.mwBasedFloor.toLocaleString()} and fixed minimum ${currencySymbol}${fixedMin.toLocaleString()})`;
```

### 3. `src/components/invoices/MergedInvoiceDialog.tsx` (~line 297)

Same label update: replace `b.committedMinimumFloor` with `b.mwBasedFloor` and rephrase "committed MW" → "synced MW".

### 4. `src/components/invoices/SupportDocument.tsx` (~line 270–285)

Render with the new field names, showing synced MW × rate = mwBasedFloor.

### 5. `src/lib/supportDocumentGenerator.ts` (~line 520–530)

Stop deriving `committedMinimumMW` from `committedMinimumFloor / rate`. Use the synced MW directly (already on the invoice/contract context) and emit `mwBasedFloor` for the support doc.

## Out of scope

- The contract form field `committed_minimum_mw` is no longer used for calculation. Leaving the DB column and form field as-is for now (silent no-op). If you want it removed from the contract form UI, say the word and we'll do that in a follow-up — it's a separate edit.
- No changes to YTD logic, anchor/cycle detection, or quarterly overage math; those already use `adjustedTotalMW` for the overage calculation.

## Validation

Reload the invoice generator on this contract. With 7.3 MW synced and €1,250/MW rate:
- `mwBasedFloor` = 7.3 × 1,250 ≈ €9,125
- `annualFloor` = max(9,125, 14,500) = €14,500 (unchanged total)
- Label now reads: "max of synced 7.30 MW × €1,250/MW = €9,125 and fixed minimum €14,500"

The support document should mirror the same wording.
