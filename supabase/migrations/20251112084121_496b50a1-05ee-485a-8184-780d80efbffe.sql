-- Create unique constraint on customers for name and user_id to support upsert
CREATE UNIQUE INDEX IF NOT EXISTS customers_name_user_id_unique ON customers(name, user_id);