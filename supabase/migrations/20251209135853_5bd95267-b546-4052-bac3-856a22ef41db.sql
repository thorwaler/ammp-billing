-- Add AND and NOT asset group filter columns to contracts table
ALTER TABLE public.contracts 
ADD COLUMN ammp_asset_group_id_and TEXT,
ADD COLUMN ammp_asset_group_name_and TEXT,
ADD COLUMN ammp_asset_group_id_not TEXT,
ADD COLUMN ammp_asset_group_name_not TEXT;