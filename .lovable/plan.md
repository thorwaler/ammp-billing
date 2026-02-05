

## Implement SharePoint Document Naming Convention (Option A)

### Overview
Update the SharePoint support document filename to use a searchable, consistent naming format:
```
{ContractName} - {Period} - {Year}.pdf
```

### Naming Format Examples

| Billing Frequency | Period Format | Example Filename |
|-------------------|---------------|------------------|
| Monthly | `Jan`, `Feb`, `Mar`, etc. | `BLS Project Management - Feb - 2025.pdf` |
| Quarterly | `Q1`, `Q2`, `Q3`, `Q4` | `BLS Project Management - Q1 - 2025.pdf` |
| Biannual | `H1`, `H2` | `Pirano Energy Ltd - H1 - 2025.pdf` |
| Annual | `Annual` | `Solar Africa - Annual - 2025.pdf` |

---

### Technical Changes

#### File: `src/components/dashboard/InvoiceCalculator.tsx`

**Location**: Line ~1400 (SharePoint upload section)

**Current code:**
```typescript
const fileName = `${(selectedCustomer.nickname || selectedCustomer.name).replace(/[^a-zA-Z0-9\s]/g, '')}_SupportDoc_${format(invoiceDate, 'yyyy-MM-dd')}.pdf`;
```

**New code:**
```typescript
// Helper function to get period label based on billing frequency
const getPeriodLabel = (date: Date, frequency: string): string => {
  const month = date.getMonth();
  switch (frequency) {
    case 'monthly':
      return format(date, 'MMM'); // Jan, Feb, Mar, etc.
    case 'quarterly':
      return `Q${Math.floor(month / 3) + 1}`; // Q1, Q2, Q3, Q4
    case 'biannual':
      return month < 6 ? 'H1' : 'H2';
    case 'annual':
    default:
      return 'Annual';
  }
};

// Use contract name if available, otherwise fall back to nickname/customer name
const documentName = (selectedCustomer.contractName || selectedCustomer.nickname || selectedCustomer.name)
  .replace(/[^a-zA-Z0-9\s-]/g, '').trim();
const periodLabel = getPeriodLabel(invoiceDate, billingFrequency);
const year = format(invoiceDate, 'yyyy');

const fileName = `${documentName} - ${periodLabel} - ${year}.pdf`;
```

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/dashboard/InvoiceCalculator.tsx` | Update filename generation logic for SharePoint uploads |

---

### Notes

- Uses `contractName` first (most descriptive), then `nickname`, then `name` as fallbacks
- Sanitizes special characters to ensure valid filenames
- Period is determined by the invoice date and billing frequency at time of creation
- If multiple invoices are created for the same period, SharePoint will handle versioning automatically

