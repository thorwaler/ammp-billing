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
];

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
