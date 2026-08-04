# Elum alerts to Slack via the Slack App connector

## Goal

Send the new Elum alerts (and other alert-page alerts) to Slack, with different alert types routed to different Slack channels, using the workspace Slack App connector.

## Why the alerts aren't reaching Slack today

Two separate alert streams exist:

- **Notifications** (bell icon) — these fire the generic webhook dispatcher.
- **Alerts page** (invoice/Elum/zero-PV alerts) — stored separately, with no webhook or Slack trigger at all.

The Elum alerts live in the second stream, so they never reach any external destination.

## What will change

### 1. Link the Slack App connector

Link the existing workspace Slack connection (`AMMP Review`) to the project. This gives the edge function a bot token to post messages as the "Lovable App" bot.

### 2. New routing table: alert/notification type → Slack channel

Create `slack_notification_routes`:

- `notification_type` (e.g. `elum_org_unassigned`, `invoice_due_soon`, `ammp_sync_failed`)
- `channel_id` — Slack channel ID (e.g. `C0123456789`)
- `channel_name` — cached display name for the UI
- `enabled` boolean
- team-wide GRANTs matching the current shared-settings model

Each enabled route posts matching events to its channel. One type can only go to one channel (simplest UI), or we can allow multiple rows per type if needed.

### 3. Route alert-page alerts to Slack

Add a database trigger on `invoice_alerts` (AFTER INSERT) that calls a new edge function or reuses the dispatcher. The dispatcher:

- Looks up active routes for the alert's `alert_type`
- Resolves severity mapping (`critical` -> `error`, `warning` -> `warning`, `info` -> `info`)
- Posts a Slack message to each configured channel via the connector gateway (`chat.postMessage`)
- Does NOT create duplicate bell notifications

### 4. Route existing notifications to Slack too

Update the current notification webhook path so it also checks `slack_notification_routes` for the notification's `type` and posts to Slack in addition to (or instead of) the generic webhook. For now we keep the generic webhook as a fallback and add Slack as a parallel delivery channel.

### 5. UI for channel routing

Refactor the Integrations page:

- Add a "Slack Channels" section listing available public channels (fetched via `conversations.list`) so the user can pick channels without knowing IDs.
- For each selectable notification/alert type, show a dropdown of configured channels.
- Add test buttons per route that send a test message to the chosen channel.
- Show a reconnect / permissions prompt if the Slack token is missing the required scopes.

### 6. New selectable alert types

Add these to the routing UI under an "Elum & Alerts" group:

- Elum Sub-org Without Tier (`elum_org_unassigned`)
- Elum Asset Double Count (`elum_asset_double_count`)
- Elum Utility Site < 2 MWp (`elum_utility_site_too_small`)
- Elum Combined Minimum Shortfall (`elum_combined_minimum_shortfall`)
- Zero PV Capacity (`zero_pv_capacity`)
- Suspicious Asset Return (`asset_reappeared_suspicious`)
- AMMP Site Count Drop (`ammp_site_count_drop`)

## Required Slack scopes

The connection needs at least:

- `chat:write` — post messages
- `channels:read` — list public channels and resolve names
- `users:read` — resolve user names if mentions are added later

Private channels require inviting the bot to the channel.

## Files likely touched

- `supabase/functions/push-notification-webhook/index.ts` — add Slack delivery loop
- New `supabase/functions/slack-post-alert/index.ts` (or extend the webhook function) — post via connector gateway
- `src/components/integrations/WebhookNotifications.tsx` or new `SlackNotifications.tsx` — channel routing UI
- `src/pages/Integrations.tsx` — include the new section
- Database migration for `slack_notification_routes` and the `invoice_alerts` trigger
