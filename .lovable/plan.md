# Elum alerts in webhooks + multiple webhook destinations

## Why the Elum alerts never reach Slack

Two separate alert streams exist today:

- **Notifications** (bell icon) — these are the only ones that fire the webhook, via a database trigger.
- **Alerts page** (invoice/Elum/zero-PV alerts) — stored separately, with no webhook trigger at all.

Every Elum alert (sub-org without tier, asset double count, Utility site under 2 MWp, combined minimum shortfall) plus Zero PV Capacity lives in the second stream, so it can't be selected or sent, no matter what is ticked in the webhook settings.

## What will change

### 1. Route alert-page alerts to webhooks

A trigger on the alerts table forwards each new alert to the same webhook dispatcher used by notifications, with its severity mapped to the webhook scale (critical -> error, warning -> warning, info -> info). No duplicate bell notifications are created.

### 2. New selectable alert types in the webhook settings

Added to the type picker under a new "Elum & Alerts" group:

- Elum Sub-org Without Tier
- Elum Asset Double Count
- Elum Utility Site < 2 MWp
- Elum Combined Minimum Shortfall
- Zero PV Capacity
- Suspicious Asset Return
- AMMP Site Count Drop

### 3. Multiple webhooks, each with its own filters

The single URL field becomes a list of webhook destinations. Each entry has:

- Name (e.g. "Slack #billing-alerts")
- URL
- On/off toggle
- Its own selected alert/notification types
- Its own minimum severity
- Its own test button

An alert is delivered to every enabled webhook whose filters match, so Elum alerts can go to one Slack channel and invoice-due reminders to another. The existing single webhook is migrated into the new list automatically as "Default webhook", so nothing currently working stops working.

## Technical notes

- New table `notification_webhooks` (name, url, enabled, notification_types, min_severity) with team-wide RLS matching the current shared-settings model, plus GRANTs; one-time data migration from `notification_settings`.
- `push-notification-webhook` loops over all enabled rows and applies per-row type/severity filters instead of reading a single settings row; test payloads target one specified webhook id.
- New trigger + function on `invoice_alerts` (AFTER INSERT) posting `alert_type`, title, description, severity, contract/customer/invoice ids to the dispatcher, mirroring `notify_webhook()`.
- `WebhookNotifications.tsx` is refactored into a list UI with an add/remove/edit card per destination; type constants extended with the alert-page types.
