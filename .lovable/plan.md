# Delete yesterday's Slack alert messages

Remove every message the alert bot posted yesterday (Aug 4, 2026) in the two channels the automation routes to.

## Channels in scope
- #elum (Elum alerts: zero PV, unassigned orgs, double counts, minimum shortfall, utility site too small)
- #contract-updates (invoice due/overdue, sync failures, MW warnings, contract expiry)

## Steps
1. Read the recent history of both channels through the Slack connector and select messages authored by the alert bot with a timestamp inside yesterday (00:00–23:59 CET, Aug 4).
2. List what was found (channel, time, title) so the set is visible before anything is removed.
3. Delete each selected message via Slack's `chat.delete` using the same connection that posted them.
4. Report per-message results, including any that Slack refuses to delete.

## Notes
- Only bot-authored alert messages are touched; human messages are left alone.
- Deletion is permanent in Slack — nothing is archived on our side first.
- If the connection lacks delete permission, the run stops and reports it instead of retrying.
