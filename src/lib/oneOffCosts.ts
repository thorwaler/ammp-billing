import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OneOffCostStatus = "pending_approval" | "pending" | "invoiced" | "dismissed";

export interface OneOffCost {
  id: string;
  contract_id: string;
  customer_id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  account_code: string;
  status: OneOffCostStatus;
  invoice_id: string | null;
  source: "manual" | "mcp";
  source_ref: string | null;
  requested_by: string | null;
  created_at: string;
  approved_at: string | null;
  invoiced_at: string | null;
}

// Table is newer than the generated types; use an untyped handle.
export const oneOffCostsTable = () => (supabase as any).from("contract_one_off_costs");

/** All one-off costs for a contract (newest first). */
export function useContractOneOffCosts(contractId?: string | null) {
  const [costs, setCosts] = useState<OneOffCost[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!contractId) { setCosts([]); return; }
    setLoading(true);
    const { data } = await oneOffCostsTable()
      .select("*")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });
    setCosts((data as OneOffCost[]) ?? []);
    setLoading(false);
  }, [contractId]);

  useEffect(() => { reload(); }, [reload]);
  return { costs, loading, reload };
}

/** Costs awaiting invoicing or approval, grouped by contract id. */
export function usePendingOneOffCostsByContract(contractIds: string[]) {
  const [byContract, setByContract] = useState<Record<string, OneOffCost[]>>({});
  const key = [...contractIds].sort().join(",");

  useEffect(() => {
    if (!key) { setByContract({}); return; }
    oneOffCostsTable()
      .select("*")
      .in("contract_id", key.split(","))
      .in("status", ["pending", "pending_approval"])
      .then(({ data }: { data: OneOffCost[] | null }) => {
        const map: Record<string, OneOffCost[]> = {};
        (data ?? []).forEach((c) => { (map[c.contract_id] ||= []).push(c); });
        setByContract(map);
      });
  }, [key]);

  return byContract;
}

/** Flip included costs to invoiced and link them to the saved invoice. */
export async function markOneOffCostsInvoiced(ids: string[], invoiceId: string | null) {
  if (ids.length === 0) return;
  await oneOffCostsTable()
    .update({ status: "invoiced", invoice_id: invoiceId, invoiced_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending");
}

/**
 * Put one-off costs back in the queue when their invoice is deleted, so they
 * reappear on the next invoice for that contract.
 * Must be called BEFORE the invoice row is deleted (the FK nulls invoice_id).
 */
export async function restoreOneOffCostsForInvoice(invoiceId: string): Promise<number> {
  const { data } = await oneOffCostsTable()
    .update({ status: "pending", invoice_id: null, invoiced_at: null })
    .eq("invoice_id", invoiceId)
    .eq("status", "invoiced")
    .select("id");
  return (data as { id: string }[] | null)?.length ?? 0;
}
