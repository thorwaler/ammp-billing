## 1. eConf sites show the wrong rate per MWp

In the "Legacy asset group — with eConf" table, each site shows €65.00/MWp/yr (the C&I Lite base rate) and a cost computed from €65 only. The eConf uplift is computed once at org level (`econfCost = totalMWp × econfRate`) and never reflected in the per-site rows, so the detail table doesn't reconcile with the org's Total column.

Fix in `src/lib/invoiceCalculations.ts` (Elum org-tier block, ~line 930-970): when eConf applies to an org, build the site rows with the combined rate (`liteBaseRate + liteEconfRate`) and cost (`mwp × combined rate × frequencyMultiplier`). The org-level `baseCost` / `econfCost` split stays as-is for the summary table and Xero line; only the per-site detail changes, so the site rows now add up to the org's Total.

Also adjust the footnote in `src/components/invoices/SupportDocument.tsx` to say the per-site table shows the combined rate (base + eConf), matching the single invoiced line.

## 2. Nightly sync failures ("Unexpected token '<', \"<html>\"")

What the data shows: every contract failed at 2026-07-30 02:00:34 — all within ~0.4s of the cron start, so the failures are instant, not timeouts. 26 contracts are now in `error` state; the last successful scheduled sync was 2026-07-07.

Where the message comes from: `ammp-scheduled-sync` calls `ammp-sync-contract` with the service-role key and does `await response.json()` unconditionally (`syncContract`, line ~150). The gateway returned an HTML error page, so JSON parsing threw and the raw parse error was pushed straight into the Slack notification.

Likely cause (to be confirmed in step 1): `ammp-sync-contract`, `ammp-data-proxy`, `ammp-token-exchange` and `ammp-device-enrichment` all have `verify_jwt = true`, and are called server-to-server with `SUPABASE_SERVICE_ROLE_KEY`. This project has moved to the signing-keys system, where the secret key is no longer a JWT — the gateway rejects those internal calls before the function ever runs (which also explains why there are no function logs at all). Manual syncs from the browser still work because they carry a real user JWT, which matches the last manual sync on 29 July.

Steps:

1. **Confirm the diagnosis** — invoke `ammp-sync-contract` with the service key and inspect the raw status/body. If it's not a gateway auth rejection, follow the actual status before changing config.
2. **Allow internal calls** — set `verify_jwt = false` for `ammp-sync-contract`, `ammp-data-proxy`, `ammp-token-exchange`, and `ammp-device-enrichment` in `supabase/config.toml`. Authorization is already enforced in code: `ammp-sync-contract` validates the caller (user JWT or service key) and checks the `can_write` role; add the same explicit check to the three helper functions so they reject unauthenticated callers.
3. **Make failures readable** — in `ammp-scheduled-sync` (`syncContract`) and in `ammp-sync-contract`'s `fetchAMMPData` / `getToken`, read the response as text first and only parse when it looks like JSON; otherwise surface `HTTP <status>: <first 200 chars>`. Slack then reports the real failure instead of a JSON parse error.
4. **Re-run and clear state** — trigger one scheduled-sync run, confirm contracts move from `error` back to `synced`, and check that no failure notifications are raised.

## Technical notes

- No database migration needed.
- Files touched: `src/lib/invoiceCalculations.ts`, `src/components/invoices/SupportDocument.tsx`, `supabase/config.toml`, `supabase/functions/ammp-scheduled-sync/index.ts`, `supabase/functions/ammp-sync-contract/index.ts`, `supabase/functions/ammp-data-proxy/index.ts`, `supabase/functions/ammp-token-exchange/index.ts`, `supabase/functions/ammp-device-enrichment/index.ts`.
- Invoice totals do not change from part 1 — only the per-site rate/cost presentation.
