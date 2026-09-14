# Custom annual fees on any contract

Add a flexible, repeatable "custom annual fee" to every contract package: you type the title and the yearly amount when creating or editing the contract, and it flows automatically into the invoice calculation, the support document and the Xero invoice.

## How it behaves

- Any number of custom fees per contract, each with a title and an annual amount.
- The annual amount is split across the billing cycle: quarterly contracts see 1/4 per invoice, monthly 1/12, biannual 1/2, annual the full amount.
- Counted as recurring revenue (ARR) and booked to the Platform Fees account in Xero.
- Available on all packages, including AMMP OS Pro, the 2026 packages and the Elum packages. Elum invoices collapse platform pricing into one line — these fees stay as their own separate lines so they are visible.
- Each fee shows as its own line on the invoice, the calculator summary and the support document, labelled with the title you entered.

## Where you enter it

A new "Custom Annual Fees" card in the contract form, below the existing add-ons section, shown for every package. Each row: title, annual amount, remove button, plus an "Add fee" button.

## Technical detail

**Database**
- Migration: add `custom_recurring_addons jsonb not null default '[]'` to `public.contracts`. Shape: `[{ id, name, annualAmount }]` (`id` a generated uuid used as the line key).

**Contract form** (`src/components/contracts/ContractForm.tsx`)
- Add `customRecurringAddons` to the zod schema, defaults, load-from-contract mapping and the save payload. Persist for every package, including the `poc` / `per_site` branch that currently clears `addons`.
- New editor component `src/components/contracts/CustomAnnualFeeEditor.tsx` (title + amount rows), rendered unconditionally in the form.

**Calculation** (`src/lib/invoiceCalculations.ts`)
- Extend the calculator input with `customRecurringAddons` and the existing billing frequency.
- New helper producing `addonCosts` entries: `cost = annualAmount * frequencyMultiplier` where multiplier is 1/12, 1/4, 1/2 or 1, with `addonId = "custom_annual:<id>"` so downstream code can recognise them.
- Append these to `result.addonCosts` so the existing `addonTotal` addition covers the standard path and the override paths (per-MW annual upfront, SPS prepaid, Elum) that already add `addonTotal` on top.

**Invoice generation** (`src/components/dashboard/InvoiceCalculator.tsx`, `src/lib/xeroLineItems.ts`)
- Xero line builders: route `custom_annual:*` add-ons to the platform/ARR account code (1002) instead of the implementation code (1000).
- ARR/NRR split: include these in `arrAmount`, exclude from `nrrAmount`.
- Merged-invoice dialog uses the same shared builder, so merged invoices get the lines with the usual contract prefix.

**Support document** (`src/lib/supportDocumentGenerator.ts`)
- No structural change needed: the fees arrive through `addonsBreakdown`. Verify the line label reads the custom title and the totals reconcile.

**Snapshots / revisions**
- Fees are part of the calculation result, so frozen snapshots and revisions carry them through unchanged; confirm the revision recompute keeps the same amounts.
