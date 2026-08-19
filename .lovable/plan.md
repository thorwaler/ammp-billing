# Fix the PV capacity sanity check reporting "250 without data"

Every one of the 250 sites came back as "without data", including the two you expected to be
flagged. That is not a plausible real-world result, so the check is almost certainly not getting
usable numbers back from AMMP at all — but the current code cannot tell us why: any failed request
is silently swallowed and reported as "no data", and the function logs show nothing but boots.

So the first step is to make the failure visible, then fix what it shows.

## Step 1 — Make the check tell us what happened

- Log the first request/response per run: the exact path, the request body, the HTTP outcome and
  the top-level keys of the payload.
- Stop collapsing errors into "no data": introduce a distinct `error` status for requests that
  failed (HTTP error, timeout, non-JSON), separate from "responded but no PV series".
- Return an `errorCount` and a short sample of error messages in the response, and show them in the
  panel on the contract page so the difference between "AMMP has no data" and "the call failed" is
  visible without reading logs.

## Step 2 — Fix the request shape

The check posts `{ asset_ids, interval, date_from, date_to }` to `/assets/{id}/data` and reads
`pv_energy_out.data`. If step 1 shows the calls succeed but the payload has no `pv_energy_out` key,
the fix is in how the metric is requested and parsed:

- Request the metric explicitly rather than relying on a default field set.
- Parse defensively: accept the series under `pv_energy_out`, under a generic `data`/`series`
  container, and accept `[timestamp, value]` pairs as well as `{ date, value }` objects.
- Fall back to a power metric (peak instantaneous AC power) when no energy series is returned, and
  use it directly as the observed kWp instead of the 5-sun-hour conversion.

If step 1 instead shows HTTP errors (auth, 400 on the body, rate limiting), the fix is the request
itself — corrected body or endpoint, with the error surfaced rather than hidden.

## Step 3 — Verify against the two sites you expect flagged

Run the check on the contract, confirm those two sites now come back with an observed value and a
`too_high` / `too_low` verdict, and confirm the "without data" count drops to something realistic.
Only sites with a real observed value can raise the `pv_capacity_ratio` alert; error rows never do.

## Technical notes

- `supabase/functions/ammp-capacity-sanity-check/index.ts`: add the `error` verdict, per-asset error
  capture, run-level logging, metric-explicit request body, tolerant series parsing, power-metric
  fallback, and `errorCount` / `errorSample` in the response payload.
- `src/pages/ContractDetails.tsx`: extend the summary strip and results table to render the new
  `error` status and the error sample.
- `src/lib/zeroPvEstimation.ts` uses the same `/assets/{id}/data` call through `ammp-data-proxy`,
  and that proxy currently drops the request body entirely — so the zero-PV estimate has the same
  bug. Fix the proxy to forward the body and align the parsing helper, so both paths share one
  working request shape.
