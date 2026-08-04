# Realistic Slack test messages

## How real alerts look today

Real alerts are not generic. When an alert row is created (zero PV, Elum org unassigned, invoice due, sync failure, etc.), the database trigger passes the full alert to Slack, and the message includes:

- Severity emoji + alert title
- The alert's own description text
- Alert type and severity
- Deep links to the contract and/or customer when the alert has them
- A `Details` block with the alert metadata (site names, MWp values, org IDs, amounts, etc.)

So production alerts already carry far more context than the current test message.

## What the test button sends now

A single generic payload: "This is a test Slack alert for X", severity `warning`, no contract, no customer, metadata `{ test: true }`. It proves the route works but doesn't show what a real alert looks like.

## Change

Give each alert type a realistic dummy payload so the test message mirrors production:

- Per-type sample title, description, severity, and metadata (e.g. zero PV: a fake site name with `0 MWp` and a last-known capacity; Elum org unassigned: a fake sub-org with covered/uncovered counts; invoice due: a fake customer, amount, currency and create-by date).
- Keep a clear `[TEST]` prefix in the title so nobody mistakes it for a live alert.
- Keep the existing generic fallback for any alert type without a sample.
- No contract/customer IDs on tests (links would 404); instead show the placeholder names in the details block.

## Technical detail

Add a `SAMPLE_PAYLOADS: Record<string, Partial<AlertPayload>>` map in `src/components/integrations/SlackNotifications.tsx` and merge it into the `slack-post-alert` invoke body in `testRoute`. No edge function or database changes needed.
