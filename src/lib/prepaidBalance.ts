/**
 * Helpers for reversing prepaid-balance side effects when an invoice is deleted.
 *
 * Two contract shapes track prepaid balances via `contracts.ytd_invoiced_amount`:
 *   - `per_mw_annual_upfront`  — annual floor billed upfront + quarterly per-MW overage.
 *   - `sps_monitoring` (with `annual_billing_anchor_date`) — annual upfront, quarterly credits.
 *
 * New invoices persist the exact ytd delta they applied:
 *   - single invoice     → `invoices.prepaid_balance_delta` (scalar)
 *   - merged invoice     → `invoices.prepaid_balance_deltas_by_contract` (map)
 *
 * Legacy invoices predate those columns; we fall back to reconstructing from Xero line items.
 */

import { supabase } from '@/integrations/supabase/client';

type Numish = number | null | undefined;

async function adjustYtd(contractId: string, deltaToRemove: number, floorZero: boolean) {
  const { data: c } = await supabase
    .from('contracts')
    .select('ytd_invoiced_amount')
    .eq('id', contractId)
    .maybeSingle();
  const current = Number(c?.ytd_invoiced_amount) || 0;
  const next = current - deltaToRemove;
  await supabase
    .from('contracts')
    .update({ ytd_invoiced_amount: floorZero ? Math.max(0, next) : next })
    .eq('id', contractId);
}

/**
 * Reverse a single-contract invoice's prepaid_balance_delta.
 * Returns true if a reversal was applied.
 */
export async function reverseSingleContractDelta(
  contractId: string,
  delta: Numish,
): Promise<boolean> {
  if (delta == null || Number(delta) === 0) return false;
  await adjustYtd(contractId, Number(delta), false);
  return true;
}

/**
 * Reverse a merged invoice's per-contract deltas map.
 * Returns the number of contracts adjusted.
 */
export async function reverseMergedDeltas(
  deltasMap: Record<string, number> | null | undefined,
): Promise<number> {
  if (!deltasMap || typeof deltasMap !== 'object') return 0;
  const entries = Object.entries(deltasMap).filter(([, d]) => Number(d) !== 0);
  for (const [contractId, d] of entries) {
    await adjustYtd(contractId, Number(d), true);
  }
  return entries.length;
}

export type LegacyReversalOutcome =
  | { kind: 'not_applicable' }
  | { kind: 'reset'; newYtd: number; warn: true }
  | { kind: 'reversed'; newYtd: number }
  | { kind: 'unresolved' };

/**
 * Best-effort reversal for invoices predating the delta columns.
 * Reconstructs the balance change from stored Xero line items.
 */
export async function reverseLegacyFromLineItems(
  contractId: string,
  invoiceDate: Date,
  xeroLineItems: any[] | null | undefined,
): Promise<LegacyReversalOutcome> {
  const { data: contract } = await supabase
    .from('contracts')
    .select('package, ytd_invoiced_amount, annual_billing_anchor_date, contract_types(pricing_model)')
    .eq('id', contractId)
    .maybeSingle();

  const pkg = (contract as any)?.package;
  const pricingModel = (contract as any)?.contract_types?.pricing_model;
  const anchor = (contract as any)?.annual_billing_anchor_date ?? null;
  const isAnnualUpfront = pkg === 'per_mw_annual_upfront' || pricingModel === 'per_mw_annual_upfront';
  const isSpsDual = pkg === 'sps_monitoring' && !!anchor;

  if (!isAnnualUpfront && !isSpsDual) return { kind: 'not_applicable' };

  const { isAnnualUpfrontCycle } = await import('@/lib/invoiceScheduling');
  const wasAnnualCycle = isAnnualUpfrontCycle(invoiceDate, anchor);
  const currentYtd = Number((contract as any)?.ytd_invoiced_amount) || 0;

  if (wasAnnualCycle) {
    await supabase.from('contracts').update({ ytd_invoiced_amount: 0 }).eq('id', contractId);
    return { kind: 'reset', newYtd: 0, warn: true };
  }

  if (!Array.isArray(xeroLineItems)) return { kind: 'unresolved' };

  if (isSpsDual) {
    // Quarterly credit reduced ytd; reverse by ADDING it back.
    const creditLine = xeroLineItems.find(
      (li: any) => typeof li?.description === 'string' && /prepaid credit applied/i.test(li.description),
    );
    const creditAmount = Math.abs(Number(creditLine?.lineAmount ?? creditLine?.unitAmount ?? 0));
    if (creditAmount > 0) {
      const newYtd = currentYtd + creditAmount;
      await supabase.from('contracts').update({ ytd_invoiced_amount: newYtd }).eq('id', contractId);
      return { kind: 'reversed', newYtd };
    }
  } else {
    // Per-MW overage line was added to ytd; reverse by subtracting.
    const overageLine = xeroLineItems.find(
      (li: any) =>
        typeof li?.description === 'string' && /per-mw|overage|quarterly overage/i.test(li.description),
    );
    const overageAmount = Math.abs(Number(overageLine?.lineAmount ?? overageLine?.unitAmount ?? 0));
    if (overageAmount > 0) {
      const newYtd = Math.max(0, currentYtd - overageAmount);
      await supabase.from('contracts').update({ ytd_invoiced_amount: newYtd }).eq('id', contractId);
      return { kind: 'reversed', newYtd };
    }
  }

  return { kind: 'unresolved' };
}
