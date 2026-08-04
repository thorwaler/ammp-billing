# Multiple Slack channels per alert + channel search

Today each alert type can be routed to exactly one Slack channel, and the channel picker is a long unfiltered dropdown (102 channels). This adds many-to-many routing and a type-to-search channel picker.

## What changes

1. **Several channels per alert type**
   - Each alert row shows the channels currently attached as removable chips.
   - "Add channel" adds another channel to the same alert; each channel can be enabled/disabled and tested individually.
   - Removing all channels for an alert simply means it is not routed to Slack.

2. **Searchable channel picker**
   - The channel selector becomes a searchable popover: type part of a channel name to filter the list instantly.
   - Channels already attached to that alert are hidden/marked so they can't be added twice.

3. **Test buttons**
   - Test sends to every enabled channel for that alert type (with a per-channel test action on each chip).

## Technical details

- **Database migration** on `slack_notification_routes`:
  - Drop `UNIQUE (notification_type)`.
  - Add `UNIQUE (notification_type, channel_id)`.
  - Existing rows are preserved; no data migration needed.
- **Edge functions**: `slack-post-alert` and `push-notification-webhook` already query routes with `.eq('notification_type', ...)` and loop over all matching rows, so fan-out to multiple channels works with no code change. Only re-deploy if touched.
- **`src/components/integrations/SlackNotifications.tsx`**:
  - Change route state from `Record<type, SlackRoute>` to `Record<type, SlackRoute[]>`.
  - Save logic: upsert each route row, delete rows removed in the UI (diff against fetched rows by `id`).
  - Replace the `Select` with shadcn `Popover` + `Command` (`CommandInput` / `CommandList` / `CommandItem`) for searchable channel selection.
  - Per-channel `Switch` (enabled) and `Send` (test) controls; test posts using the specific `channel_id`.
- No schema or behaviour change for the generic webhook notifications.
