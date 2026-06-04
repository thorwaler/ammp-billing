/**
 * Centralized helpers for computing a contract's next invoice date.
 *
 * Standard packages use a single billing frequency (monthly/quarterly/biannual/annual).
 *
 * The `per_mw_annual_upfront` package is dual-cadence:
 *   - Quarterly overage invoices on the regular quarter boundary.
 *   - One annual upfront invoice on the anchor month each year.
 * The "next invoice date" is whichever comes first.
 */
import { addMonths, addYears } from "date-fns";

export type BillingFrequency = "monthly" | "quarterly" | "biannual" | "annual";

export function advanceByFrequency(date: Date, frequency: string): Date {
  switch (frequency) {
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addMonths(date, 3);
    case "biannual": return addMonths(date, 6);
    case "annual":
    default: return addYears(date, 1);
  }
}

interface NextInvoiceContext {
  packageType?: string | null;
  billingFrequency?: string | null;
  annualBillingAnchorDate?: string | Date | null;
}

/**
 * Returns the next invoice date for a contract, given the current next-invoice
 * date and the contract context. Handles dual-cadence packages.
 */
export function getNextInvoiceDate(currentDate: string | Date, ctx: NextInvoiceContext): Date {
  const base = typeof currentDate === "string" ? new Date(currentDate) : new Date(currentDate);
  const freq = ctx.billingFrequency || "annual";

  if (ctx.packageType === "per_mw_annual_upfront") {
    // Quarterly cadence always advances by 3 months.
    const nextQuarter = addMonths(base, 3);
    // Annual anchor — next occurrence after `base`.
    if (ctx.annualBillingAnchorDate) {
      const anchor = new Date(ctx.annualBillingAnchorDate);
      const nextAnnual = new Date(base);
      nextAnnual.setUTCMonth(anchor.getUTCMonth());
      nextAnnual.setUTCDate(anchor.getUTCDate());
      // Walk forward until strictly after `base`.
      while (nextAnnual.getTime() <= base.getTime()) {
        nextAnnual.setUTCFullYear(nextAnnual.getUTCFullYear() + 1);
      }
      return nextQuarter.getTime() < nextAnnual.getTime() ? nextQuarter : nextAnnual;
    }
    return nextQuarter;
  }

  return advanceByFrequency(base, freq);
}

/**
 * Returns true if the given invoice date falls on the annual anchor month
 * for a `per_mw_annual_upfront` contract — i.e., this invoice is the
 * annual upfront cycle.
 */
export function isAnnualUpfrontCycle(invoiceDate: string | Date, anchorDate?: string | Date | null): boolean {
  if (!anchorDate) return false;
  const inv = typeof invoiceDate === "string" ? new Date(invoiceDate) : invoiceDate;
  const anchor = new Date(anchorDate);
  return inv.getUTCMonth() === anchor.getUTCMonth();
}
