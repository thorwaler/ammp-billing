-- Clear all invoice alerts (false positives from partial syncs)
DELETE FROM invoice_alerts;

-- Clear all asset status history (will be recreated on next sync)
DELETE FROM asset_status_history;