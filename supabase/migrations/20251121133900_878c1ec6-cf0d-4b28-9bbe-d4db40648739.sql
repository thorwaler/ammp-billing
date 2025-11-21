-- Create contract_amendments table
CREATE TABLE contract_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  amendment_number integer NOT NULL,
  amendment_date timestamptz NOT NULL DEFAULT now(),
  effective_date timestamptz,
  pdf_url text NOT NULL,
  ocr_data jsonb DEFAULT '{}'::jsonb,
  ocr_status text DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_processed_at timestamptz,
  changes_summary text,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contract_id, amendment_number)
);

-- Add RLS policies
ALTER TABLE contract_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contract amendments"
  ON contract_amendments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contract amendments"
  ON contract_amendments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contract amendments"
  ON contract_amendments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contract amendments"
  ON contract_amendments FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_contract_amendments_updated_at
  BEFORE UPDATE ON contract_amendments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add indexes for efficient queries
CREATE INDEX idx_contract_amendments_contract_id ON contract_amendments(contract_id);
CREATE INDEX idx_contract_amendments_amendment_date ON contract_amendments(amendment_date DESC);