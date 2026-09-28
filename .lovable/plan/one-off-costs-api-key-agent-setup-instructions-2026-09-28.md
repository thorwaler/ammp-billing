# One-Off Costs — API Key & Agent Setup Instructions

## 1. Store the API key

- Check existing secrets (`fetch_secrets`), then store the key `AMMPHermes2026!` as the secret `ONE_OFF_COSTS_MCP_KEY` via `set_secret` (value already known, so no secure form needed).
- The already-deployed `one-off-costs-mcp` edge function reads `ONE_OFF_COSTS_MCP_KEY` and requires `Authorization: Bearer <key>` — no code change needed.

## 2. Instructions for the agent creator (deliver in chat, and save as a doc)

### Endpoint
- URL: `https://<project-ref>.supabase.co/functions/v1/one-off-costs-mcp/mcp`
- Protocol: MCP over Streamable HTTP (POST), Hermes-native.

### Authentication
- Header on every request: `Authorization: Bearer AMMPHermes2026!`
- Key is provisioned through the secret store, never hardcoded in agent config.

### Connection sequence
1. `initialize` — standard MCP handshake (`protocolVersion`, client info).
2. `notifications/initialized` — confirm the session.
3. `tools/list` — discover available tools.
4. `tools/call` — invoke a tool.

### Available tools
- `list_customers` — list customers (id, name) to resolve names to IDs.
- `list_contracts` — list contracts for a customer (id, package, status).
- `list_pending_costs` — list pending one-off costs (optional contract filter).
- `add_one_off_cost` — propose a new one-off cost. Args: `contract_id`, `title`, `amount` (major currency units, e.g. 750.00), optional `currency`, `description`, `idempotency_key`.

### Behavior rules for the agent
- Always resolve the customer and contract via `list_customers`/`list_contracts` before calling `add_one_off_cost`; never guess IDs.
- Always send an `idempotency_key` (e.g. a UUID per user request) so retries never double-charge.
- Agent-created costs land as `pending_approval` — a human must approve them on the contract page before they appear on an invoice. The agent should tell the Slack user this.
- Amounts are in major currency units; the server validates the contract exists and the amount is positive.

## Technical details
- Secret name: `ONE_OFF_COSTS_MCP_KEY`, value `AMMPHermes2026!` (stored via `set_secret` after `fetch_secrets` confirms the name is free).
- Edge function already live: `supabase/functions/one-off-costs-mcp/index.ts` (JWT verification off; bearer key checked in code).
- Note: the key contains `!` — fine in a header value; agents should send it verbatim, no escaping.
