// Streamable HTTP MCP server (stateless, JSON responses) for adding
// contract-level one-off costs from the Hermes Slack agent.
// Auth: Authorization: Bearer <ONE_OFF_COSTS_MCP_API_KEY>
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const TOOLS = [
  {
    name: "search_contracts",
    description:
      "Find active contracts by customer name, nickname or contract name. Use this to get the contract_id before adding a one-off cost.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Customer or contract name fragment" } },
      required: ["query"],
    },
  },
  {
    name: "list_pending_one_off_costs",
    description: "List one-off costs not yet invoiced (awaiting approval or queued for the next invoice) for a contract.",
    inputSchema: {
      type: "object",
      properties: { contract_id: { type: "string", format: "uuid" } },
      required: ["contract_id"],
    },
  },
  {
    name: "add_one_off_cost",
    description:
      "Queue a one-off charge on a contract. Only call this after a human in Slack has explicitly confirmed the contract, title and amount. The cost is created as 'awaiting approval' and must be approved in the AMMP billing app before it is added to the next invoice. Currency always follows the contract.",
    inputSchema: {
      type: "object",
      properties: {
        contract_id: { type: "string", format: "uuid" },
        title: { type: "string", maxLength: 200 },
        description: { type: "string", maxLength: 2000 },
        amount: { type: "number", exclusiveMinimum: 0, maximum: 1000000, description: "Amount in the contract currency" },
        account_code: { type: "string", enum: ["1000", "1002"], description: "1000 Implementation/NRR (default), 1002 Platform/ARR" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 200, description: "Unique per intended charge, e.g. Slack message ts" },
        requested_by: { type: "string", maxLength: 200, description: "Slack user who requested the charge" },
        approved_by_human: { type: "boolean", description: "Must be true: a human confirmed this charge in Slack" },
        source_ref: { type: "string", maxLength: 500, description: "Slack permalink or thread reference" },
      },
      required: ["contract_id", "title", "amount", "idempotency_key", "requested_by", "approved_by_human"],
    },
  },
  {
    name: "query_invoiced_revenue",
    description:
      "Query realised revenue (ARR = recurring platform fees, account 1002; NRR = one-off/implementation fees, account 1000) from invoices in a date period. Optionally filter by customer name or contract. Excludes invoices that were replaced by a revision. Amounts are reported in EUR as well as in the original invoice currency.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Period start, YYYY-MM-DD (inclusive)" },
        end_date: { type: "string", description: "Period end, YYYY-MM-DD (inclusive)" },
        customer_name: { type: "string", description: "Optional customer name or nickname fragment" },
        contract_id: { type: "string", format: "uuid", description: "Optional contract filter" },
        include_invoices: { type: "boolean", description: "Include the per-invoice breakdown (default true, max 100 rows)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_current_arr_run_rate",
    description:
      "Current annualised recurring revenue (ARR run-rate) per contract, derived from each contract's most recent invoice: the recurring (account 1002) portion annualised by the billing frequency. Optionally filter by customer name or contract.",
    inputSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Optional customer name or nickname fragment" },
        contract_id: { type: "string", format: "uuid", description: "Optional contract filter" },
      },
    },
  },
];

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const RevenueSchema = z.object({
  start_date: DateStr,
  end_date: DateStr,
  customer_name: z.string().trim().min(2).max(120).optional(),
  contract_id: z.string().uuid().optional(),
  include_invoices: z.boolean().default(true),
});

const RunRateSchema = z.object({
  customer_name: z.string().trim().min(2).max(120).optional(),
  contract_id: z.string().uuid().optional(),
});

// Fraction of a year covered by one invoice of the given billing frequency.
function frequencyFraction(freq: string | null): number {
  switch (freq) {
    case "monthly": return 1 / 12;
    case "quarterly": return 0.25;
    case "biannual": return 0.5;
    case "annual": return 1;
    default: return 1;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function findCustomerIds(fragment: string): Promise<string[]> {
  const q = fragment.replace(/[%,()]/g, "");
  const { data } = await db.from("customers").select("id").or(`name.ilike.%${q}%,nickname.ilike.%${q}%`).limit(50);
  return (data ?? []).map((c) => c.id);
}

function contractMatches(inv: { contract_id: string | null; merged_contract_ids: unknown }, contractId: string) {
  if (inv.contract_id === contractId) return true;
  const merged = inv.merged_contract_ids;
  return Array.isArray(merged) && merged.some((m) => (typeof m === "string" ? m : (m as any)?.contractId) === contractId);
}

const eur = (eurVal: number | null, native: number | null) => eurVal ?? native ?? 0;

const AddSchema = z.object({
  contract_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  amount: z.number().positive().max(1_000_000),
  account_code: z.enum(["1000", "1002"]).default("1000"),
  idempotency_key: z.string().min(8).max(200),
  requested_by: z.string().trim().min(1).max(200),
  approved_by_human: z.literal(true, { errorMap: () => ({ message: "approved_by_human must be true" }) }),
  source_ref: z.string().max(500).optional(),
});

const text = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "search_contracts") {
    const q = String(args.query ?? "").trim().replace(/[%,()]/g, "");
    if (q.length < 2) return text("query must be at least 2 characters", true);
    const { data: customers } = await db
      .from("customers").select("id, name, nickname")
      .or(`name.ilike.%${q}%,nickname.ilike.%${q}%`).limit(20);
    const ids = (customers ?? []).map((c) => c.id);
    const { data: contracts } = await db
      .from("contracts")
      .select("id, contract_name, company_name, package, currency, contract_status, next_invoice_date, customer_id")
      .or(`contract_name.ilike.%${q}%${ids.length ? `,customer_id.in.(${ids.join(",")})` : ""}`)
      .neq("contract_status", "cancelled").limit(25);
    return text((contracts ?? []).map((c) => ({
      contract_id: c.id,
      contract_name: c.contract_name,
      customer: customers?.find((x) => x.id === c.customer_id)?.name ?? c.company_name,
      package: c.package, currency: c.currency, status: c.contract_status, next_invoice_date: c.next_invoice_date,
    })));
  }

  if (name === "list_pending_one_off_costs") {
    const id = z.string().uuid().safeParse(args.contract_id);
    if (!id.success) return text("contract_id must be a UUID", true);
    const { data, error } = await db.from("contract_one_off_costs")
      .select("id, title, amount, currency, account_code, status, requested_by, created_at")
      .eq("contract_id", id.data).in("status", ["pending", "pending_approval"]);
    if (error) return text(error.message, true);
    return text(data);
  }

  if (name === "query_invoiced_revenue") {
    const parsed = RevenueSchema.safeParse(args);
    if (!parsed.success) return text({ error: "validation_failed", details: parsed.error.flatten().fieldErrors }, true);
    const a = parsed.data;
    if (a.start_date > a.end_date) return text("start_date must be on or before end_date", true);

    let customerIds: string[] | null = null;
    if (a.customer_name) {
      customerIds = await findCustomerIds(a.customer_name);
      if (customerIds.length === 0) return text({ error: "no_customer_match", customer_name: a.customer_name }, true);
    }

    let query = db.from("invoices")
      .select("id, invoice_date, currency, invoice_amount, invoice_amount_eur, arr_amount, arr_amount_eur, nrr_amount, nrr_amount_eur, xero_amount_credited, xero_amount_credited_eur, xero_reference, xero_status, contract_id, merged_contract_ids, customer_id, customers(name, nickname)")
      .is("superseded_at", null)
      .gte("invoice_date", `${a.start_date}T00:00:00Z`)
      .lte("invoice_date", `${a.end_date}T23:59:59Z`)
      .order("invoice_date", { ascending: true })
      .limit(1000);
    if (customerIds) query = query.in("customer_id", customerIds);

    const { data, error } = await query;
    if (error) return text(error.message, true);
    let rows = data ?? [];
    if (a.contract_id) rows = rows.filter((r: any) => contractMatches(r, a.contract_id!));

    let total = 0, arr = 0, nrr = 0, credited = 0;
    const byCustomer = new Map<string, { customer: string; total: number; arr: number; nrr: number; invoices: number }>();

    for (const r of rows as any[]) {
      const t = eur(r.invoice_amount_eur, r.invoice_amount);
      const ar = eur(r.arr_amount_eur, r.arr_amount);
      const nr = eur(r.nrr_amount_eur, r.nrr_amount);
      const cr = eur(r.xero_amount_credited_eur, r.xero_amount_credited);
      total += t; arr += ar; nrr += nr; credited += cr;
      const nm = r.customers?.nickname || r.customers?.name || "Unknown";
      const acc = byCustomer.get(nm) ?? { customer: nm, total: 0, arr: 0, nrr: 0, invoices: 0 };
      acc.total += t; acc.arr += ar; acc.nrr += nr; acc.invoices += 1;
      byCustomer.set(nm, acc);
    }

    return text({
      period: { start_date: a.start_date, end_date: a.end_date },
      filters: { customer_name: a.customer_name ?? null, contract_id: a.contract_id ?? null },
      currency: "EUR",
      summary: {
        invoice_count: rows.length,
        total_invoiced: round2(total),
        arr_total: round2(arr),
        nrr_total: round2(nrr),
        credited_total: round2(credited),
        net_revenue: round2(total - credited),
      },
      by_customer: Array.from(byCustomer.values())
        .map((c) => ({ ...c, total: round2(c.total), arr: round2(c.arr), nrr: round2(c.nrr) }))
        .sort((x, y) => y.total - x.total),
      invoices: a.include_invoices
        ? (rows as any[]).slice(0, 100).map((r) => ({
            invoice_id: r.id,
            invoice_date: r.invoice_date?.slice(0, 10),
            customer: r.customers?.nickname || r.customers?.name || "Unknown",
            reference: r.xero_reference ?? null,
            xero_status: r.xero_status ?? null,
            currency: r.currency ?? "EUR",
            amount_original: r.invoice_amount ?? 0,
            amount_eur: round2(eur(r.invoice_amount_eur, r.invoice_amount)),
            arr_eur: round2(eur(r.arr_amount_eur, r.arr_amount)),
            nrr_eur: round2(eur(r.nrr_amount_eur, r.nrr_amount)),
            merged: Array.isArray(r.merged_contract_ids) && r.merged_contract_ids.length > 1,
          }))
        : undefined,
      note: "ARR = account 1002 (recurring platform fees); NRR = account 1000 (implementation / one-off). Superseded (revised) invoices are excluded.",
    });
  }

  if (name === "get_current_arr_run_rate") {
    const parsed = RunRateSchema.safeParse(args);
    if (!parsed.success) return text({ error: "validation_failed", details: parsed.error.flatten().fieldErrors }, true);
    const a = parsed.data;

    let cQuery = db.from("contracts")
      .select("id, contract_name, company_name, package, currency, billing_frequency, contract_status, customer_id, customers(name, nickname)")
      .eq("contract_status", "active")
      .neq("package", "poc")
      .limit(500);
    if (a.contract_id) cQuery = cQuery.eq("id", a.contract_id);
    if (a.customer_name) {
      const ids = await findCustomerIds(a.customer_name);
      if (ids.length === 0) return text({ error: "no_customer_match", customer_name: a.customer_name }, true);
      cQuery = cQuery.in("customer_id", ids);
    }
    const { data: contracts, error } = await cQuery;
    if (error) return text(error.message, true);
    if (!contracts?.length) return text({ contracts: [], message: "No matching active contracts" });

    const results: any[] = [];
    for (const c of contracts as any[]) {
      const { data: invs } = await db.from("invoices")
        .select("invoice_date, billing_frequency, currency, arr_amount, arr_amount_eur, invoice_amount, invoice_amount_eur, contract_id, merged_contract_ids")
        .is("superseded_at", null)
        .eq("contract_id", c.id)
        .order("invoice_date", { ascending: false })
        .limit(1);
      const inv = invs?.[0] as any | undefined;
      const fraction = frequencyFraction(inv?.billing_frequency ?? c.billing_frequency);
      const arrPeriod = inv ? eur(inv.arr_amount_eur, inv.arr_amount) : 0;
      results.push({
        contract_id: c.id,
        contract: c.contract_name ?? c.company_name,
        customer: c.customers?.nickname || c.customers?.name || c.company_name,
        package: c.package,
        currency: c.currency ?? "EUR",
        billing_frequency: inv?.billing_frequency ?? c.billing_frequency,
        last_invoice_date: inv?.invoice_date?.slice(0, 10) ?? null,
        last_invoice_arr_eur: round2(arrPeriod),
        annualised_arr_eur: round2(fraction > 0 ? arrPeriod / fraction : 0),
        billed_via_merged_invoice: false,
      });
    }

    // Contracts billed through merged invoices have no invoice of their own.
    // Attribute the merged invoice once, listing the contracts it covers.
    const contractIds = new Set((contracts as any[]).map((c) => c.id));
    const customerIds = [...new Set((contracts as any[]).map((c) => c.customer_id))];
    const mergedGroups: any[] = [];
    if (customerIds.length) {
      const { data: mergedInvs } = await db.from("invoices")
        .select("id, invoice_date, billing_frequency, arr_amount, arr_amount_eur, merged_contract_ids, customer_id, customers(name, nickname)")
        .is("superseded_at", null)
        .not("merged_contract_ids", "is", null)
        .in("customer_id", customerIds)
        .order("invoice_date", { ascending: false })
        .limit(200);
      const seenCustomer = new Set<string>();
      for (const m of (mergedInvs ?? []) as any[]) {
        const ids = (Array.isArray(m.merged_contract_ids) ? m.merged_contract_ids : [])
          .map((x: any) => (typeof x === "string" ? x : x?.contractId))
          .filter((x: any) => typeof x === "string" && contractIds.has(x));
        if (ids.length < 1) continue;
        if (seenCustomer.has(m.customer_id)) continue; // only the most recent merged invoice per customer
        seenCustomer.add(m.customer_id);
        const fraction = frequencyFraction(m.billing_frequency);
        const arrPeriod = eur(m.arr_amount_eur, m.arr_amount);
        mergedGroups.push({
          customer: m.customers?.nickname || m.customers?.name || "Unknown",
          invoice_date: m.invoice_date?.slice(0, 10),
          billing_frequency: m.billing_frequency,
          contract_ids: ids,
          contract_count: ids.length,
          last_invoice_arr_eur: round2(arrPeriod),
          annualised_arr_eur: round2(fraction > 0 ? arrPeriod / fraction : 0),
        });
        for (const id of ids) {
          const r = results.find((x) => x.contract_id === id);
          if (r) r.billed_via_merged_invoice = true;
        }
      }
    }

    const totalArr =
      results.filter((r) => !r.billed_via_merged_invoice).reduce((s, r) => s + r.annualised_arr_eur, 0) +
      mergedGroups.reduce((s, m) => s + m.annualised_arr_eur, 0);

    return text({
      filters: { customer_name: a.customer_name ?? null, contract_id: a.contract_id ?? null },
      currency: "EUR",
      total_annualised_arr_eur: round2(totalArr),
      contract_count: results.length,
      contracts: results.sort((x, y) => y.annualised_arr_eur - x.annualised_arr_eur),
      merged_invoice_groups: mergedGroups,
      note: "Run-rate is derived from each contract's latest invoice: the recurring (account 1002) portion annualised by billing frequency. Contracts billed on a merged invoice are reported once under merged_invoice_groups and show billed_via_merged_invoice = true. Contracts never invoiced show 0.",
    });
  }

  if (name === "add_one_off_cost") {
    const parsed = AddSchema.safeParse(args);
    if (!parsed.success) return text({ error: "validation_failed", details: parsed.error.flatten().fieldErrors }, true);
    const a = parsed.data;

    const { data: existing } = await db.from("contract_one_off_costs")
      .select("id, contract_id, title, amount, currency, status").eq("idempotency_key", a.idempotency_key).maybeSingle();
    if (existing) return text({ duplicate: true, message: "Already recorded with this idempotency_key", cost: existing });

    const { data: contract } = await db.from("contracts")
      .select("id, customer_id, currency, contract_status, contract_name, company_name").eq("id", a.contract_id).maybeSingle();
    if (!contract) return text("Contract not found", true);
    if (contract.contract_status === "cancelled") return text("Contract is cancelled", true);

    const { data: row, error } = await db.from("contract_one_off_costs").insert({
      contract_id: contract.id,
      customer_id: contract.customer_id,
      title: a.title,
      description: a.description ?? null,
      amount: Math.round(a.amount * 100) / 100,
      currency: contract.currency || "EUR",
      account_code: a.account_code,
      status: "pending_approval",
      source: "mcp",
      source_ref: a.source_ref ?? null,
      requested_by: a.requested_by,
      idempotency_key: a.idempotency_key,
    }).select("id, title, amount, currency, status").single();
    if (error) {
      if (error.code === "23505") return text({ duplicate: true, message: "Already recorded with this idempotency_key" });
      return text(error.message, true);
    }
    console.log(JSON.stringify({ audit: "one_off_cost_added", id: row.id, contract_id: contract.id, by: a.requested_by }));
    return text({
      ...row,
      contract: contract.contract_name ?? contract.company_name,
      message: "Recorded. A finance team member must approve it in the billing app before it appears on the next invoice.",
    });
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const expected = Deno.env.get("ONE_OFF_COSTS_MCP_API_KEY") ?? "";
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !safeEqual(token, expected)) return json({ error: "Unauthorized" }, 401);

  if (req.method === "GET") return new Response("SSE stream not supported", { status: 405, headers: cors });
  if (req.method === "DELETE") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const handle = async (msg: any) => {
    const { id, method, params } = msg ?? {};
    if (id === undefined || id === null) return null; // notification
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        return {
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "ammp-one-off-costs", version: "1.0.0" },
          },
        };
      }
      case "ping": return { jsonrpc: "2.0", id, result: {} };
      case "tools/list": return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        try {
          const result = await callTool(params?.name, params?.arguments ?? {});
          if (!result) return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } };
          return { jsonrpc: "2.0", id, result };
        } catch (e) {
          return { jsonrpc: "2.0", id, result: text(`Internal error: ${(e as Error).message}`, true) };
        }
      }
      default: return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  };

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  const out = await handle(body);
  return out ? json(out) : new Response(null, { status: 202, headers: cors });
});
