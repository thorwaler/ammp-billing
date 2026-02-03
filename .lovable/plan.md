
## Fix: Pirano Support Document Totals Mismatch

### Problem Summary
The Pirano Energy Ltd contract uses the **capped** package (biannual billing, €10,125 annual fee). The support document shows a "Totals Mismatch" error because:
- Invoice Total: **€5,062.50** (correctly calculated: €10,125 × 0.5 for biannual)
- Support Document Calculated Total: **€0**
- Result: **Mismatch** ❌

### Root Cause
The support document generator (`src/lib/supportDocumentGenerator.ts`) doesn't include the **capped package fixed fee** (`starterPackageCost`) in its calculation breakdown. The validation logic calculates:

```text
calculatedTotal = assetBreakdownPeriodTotal + minimumCharges + minimumContractAdjustment + ...
```

For capped packages:
- `assetBreakdownPeriodTotal = 0` (no asset breakdown)
- `starterPackageCost` is never added to the calculation breakdown

### Solution

Update the support document generator to handle capped (and starter) packages by including the fixed fee in the calculation breakdown.

---

### Technical Changes

#### File: `src/lib/supportDocumentGenerator.ts`

**Problem location (lines 359-403)**: The calculation breakdown logic doesn't account for `starterPackageCost`.

**Current logic flow**:
```typescript
let assetBreakdownPeriodTotal: number;

if (siteMinimumPricingSummary) { ... }
else if (perSiteBreakdown) { ... }
else if (elumInternalBreakdown) { ... }
else if (elumJubailiBreakdown) { ... }
else if (elumEpmBreakdown) { ... }
else {
  // Falls here for capped/starter - but assetBreakdownTotal = 0!
  assetBreakdownPeriodTotal = assetBreakdownTotal * frequencyMultiplier;
}

const calculatedTotal = assetBreakdownPeriodTotal + ...
// Missing: starterPackageCost!
```

**Fix**: Add a new field `cappedPackageCost` (or `fixedPackageCost`) to the calculation breakdown and include it in the total.

**Changes needed**:

1. **Add to `SupportDocumentData.calculationBreakdown` interface**:
   - New field: `fixedPackageCost: number` (represents starter/capped fixed fee)

2. **Update calculation logic**:
   - For capped/starter packages, set `fixedPackageCost = calculationResult.starterPackageCost`
   - Include `fixedPackageCost` in `calculatedTotal`

3. **Update UI display** in `SupportDocument.tsx`:
   - Show "Fixed Package Fee" line item when `fixedPackageCost > 0`

---

### Detailed Code Changes

#### 1. Update Interface (`src/lib/supportDocumentGenerator.ts`)

Add `fixedPackageCost` to `calculationBreakdown`:
```typescript
calculationBreakdown: {
  assetBreakdownPeriod: number;
  minimumCharges: number;
  minimumContractAdjustment: number;
  baseMonthlyPrice: number;
  retainerCost: number;
  addonsTotal: number;
  discountedAssetsTotal: number;
  fixedPackageCost: number; // NEW: For starter/capped packages
};
```

#### 2. Update Calculation Logic

After line ~391, add handling for capped/starter packages:
```typescript
// Handle starter/capped packages with fixed annual fee
let fixedPackageCost = 0;
if (calculationResult.starterPackageCost > 0) {
  fixedPackageCost = calculationResult.starterPackageCost;
}
```

Update `calculatedTotal` to include it:
```typescript
const calculatedTotal = assetBreakdownPeriodTotal + 
  minimumChargesForBreakdown + 
  minimumContractAdjustment +
  calculationResult.basePricingCost +
  calculationResult.retainerCost +
  discountedAssetsTotal +
  totalAddonCosts +
  fixedPackageCost; // NEW
```

Add to the returned breakdown:
```typescript
calculationBreakdown: {
  assetBreakdownPeriod: assetBreakdownPeriodTotal,
  minimumCharges: minimumChargesForBreakdown,
  minimumContractAdjustment,
  baseMonthlyPrice: calculationResult.basePricingCost,
  retainerCost: calculationResult.retainerCost,
  addonsTotal: totalAddonCosts,
  discountedAssetsTotal,
  fixedPackageCost // NEW
}
```

#### 3. Update UI (`src/components/invoices/SupportDocument.tsx`)

In the calculation breakdown section (around line 509-516), add:
```tsx
{data.calculationBreakdown.fixedPackageCost > 0 && (
  <div className="flex justify-between">
    <span>Fixed Package Fee:</span>
    <span>{formatCurrency(data.calculationBreakdown.fixedPackageCost)}</span>
  </div>
)}
```

---

### Expected Result

After the fix:
- Pirano support document will show:
  - **Fixed Package Fee: €5,062.50**
  - **Support Document Total: €5,062.50**
  - **Invoice Total: €5,062.50**
  - **✓ Totals Match** ✅

---

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/supportDocumentGenerator.ts` | Add `fixedPackageCost` to interface and calculation logic |
| `src/components/invoices/SupportDocument.tsx` | Display fixed package fee in breakdown section |

---

### Validation Checklist

After implementation:
1. Create/view an invoice for Pirano (capped package)
2. Open the support document
3. Verify the "Fixed Package Fee" line item appears with €5,062.50
4. Verify "Totals Match" shows green checkmark
5. Test with a starter package contract to ensure same fix applies
