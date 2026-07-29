import { supabase } from "@/integrations/supabase/client";
import { ELUM_COMBINED_ANNUAL_MINIMUM } from "@/data/pricingData";

/**
 * Combined annual minimum across ALL contracts of a customer (Elum).
 *
 * Unlike per-contract minimums, this is reconciled once per year on the
 * anniversary of the parent-org anchor date. Order of operations agreed with
 * Elum: apply each contract's own minimum first, sum the resulting invoiced
 * values, and only then compare the total against the combined threshold. The
 * difference is added to the following invoice.
 */

export interface CombinedMinimumStatus {
  /** the combined threshold in contract currency */
  threshold: number;
  /** start of the annual window being reconciled */
  windowStart: Date;
  /** end of the annual window (exclusive) */
  windowEnd: Date;
  /** total invoiced across all the customer's contracts inside the window */
  invoicedInWindow: number;
  /** amount still owed to reach the threshold (0 when already met) */
  shortfall: number;
  /** true when the window has closed and the shortfall is ready to bill */
  dueNow: boolean;
  /** already reconciled for this window */
  alreadyReconciled: boolean;
}

/** Move the anchor forward year by year until the window contains `asOf`. */
export function currentAnnualWindow(anchor: Date, asOf: Date): { start: Date; end: Date } {
  const start = new Date(anchor);
  start.setFullYear(anchor.getFullYear());
  while (start > asOf) start.setFullYear(start.getFullYear() - 1);
  let end = new Date(start);
  end.setFullYear(start.getFullYear() + 1);
  while (end <= asOf) {
    start.setFullYear(start.getFullYear() + 1);
    end = new Date(start);
    end.setFullYear(start.getFullYear() + 1);
  }
  return { start, end };
}

export async function getCombinedMinimumStatus(
  customerId: string,
  asOf: Date = new Date()
): Promise<CombinedMinimumStatus | null> {
  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "combined_minimum_annual_value, combined_minimum_anchor_date, last_combined_minimum_reconciled_at"
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) return null;

  const anchorRaw = (customer as any).combined_minimum_anchor_date;
  if (!anchorRaw) return null;

  const threshold =
    Number((customer as any).combined_minimum_annual_value) || ELUM_COMBINED_ANNUAL_MINIMUM;
  const anchor = new Date(anchorRaw);
  const { start, end } = currentAnnualWindow(anchor, asOf);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("invoice_amount, invoice_date")
    .eq("customer_id", customerId)
    .gte("invoice_date", start.toISOString())
    .lt("invoice_date", end.toISOString());

  const invoicedInWindow = (invoices || []).reduce(
    (sum, inv) => sum + (Number(inv.invoice_amount) || 0),
    0
  );

  const lastReconciled = (customer as any).last_combined_minimum_reconciled_at
    ? new Date((customer as any).last_combined_minimum_reconciled_at)
    : null;

  return {
    threshold,
    windowStart: start,
    windowEnd: end,
    invoicedInWindow,
    shortfall: Math.max(0, threshold - invoicedInWindow),
    dueNow: asOf >= end,
    alreadyReconciled: !!lastReconciled && lastReconciled >= start,
  };
}

/** Mark the current window as reconciled so the shortfall is not billed twice. */
export async function markCombinedMinimumReconciled(customerId: string, at: Date = new Date()) {
  await supabase
    .from("customers")
    .update({ last_combined_minimum_reconciled_at: at.toISOString() } as any)
    .eq("id", customerId);
}
