-- Create ammp_sync_history table for audit trail
CREATE TABLE ammp_sync_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  synced_at timestamptz DEFAULT now(),
  
  -- MW Values
  total_mw numeric,
  ongrid_mw numeric,
  hybrid_mw numeric,
  
  -- Site Counts
  total_sites integer,
  ongrid_sites integer,
  hybrid_sites integer,
  sites_with_solcast integer,
  
  -- Change tracking
  previous_total_mw numeric,
  mw_delta numeric,
  
  -- Full asset breakdown for detailed comparison
  asset_breakdown jsonb,
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ammp_sync_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sync history"
  ON ammp_sync_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Managers and admins can create sync history"
  ON ammp_sync_history FOR INSERT
  WITH CHECK (auth.uid() = user_id AND can_write(auth.uid()));

-- Index for efficient queries
CREATE INDEX idx_ammp_sync_history_customer 
  ON ammp_sync_history(customer_id, synced_at DESC);