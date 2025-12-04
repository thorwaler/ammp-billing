-- Backfill site_billing_status for existing per_site contracts with AMMP data
-- This is a one-time migration to populate billing records for customers that already have AMMP sync

DO $$
DECLARE
  contract_rec RECORD;
  customer_rec RECORD;
  asset RECORD;
  onboarding_date TIMESTAMPTZ;
  next_annual_due TIMESTAMPTZ;
BEGIN
  -- Find all active per_site contracts
  FOR contract_rec IN 
    SELECT c.id as contract_id, c.customer_id, c.user_id
    FROM contracts c
    WHERE c.package = 'per_site'
    AND c.contract_status = 'active'
  LOOP
    -- Get the customer's AMMP capabilities
    SELECT ammp_capabilities INTO customer_rec
    FROM customers
    WHERE id = contract_rec.customer_id;
    
    -- Skip if no AMMP data
    IF customer_rec IS NULL OR customer_rec.ammp_capabilities IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Process each asset in the breakdown
    FOR asset IN 
      SELECT * FROM jsonb_array_elements(customer_rec.ammp_capabilities->'assetBreakdown')
    LOOP
      -- Check if record already exists
      IF NOT EXISTS (
        SELECT 1 FROM site_billing_status 
        WHERE asset_id = asset.value->>'assetId' 
        AND contract_id = contract_rec.contract_id
      ) THEN
        -- Calculate dates
        onboarding_date := COALESCE(
          (asset.value->>'onboardingDate')::TIMESTAMPTZ, 
          NOW()
        );
        next_annual_due := onboarding_date + INTERVAL '1 year';
        
        -- Insert new record
        INSERT INTO site_billing_status (
          user_id,
          contract_id,
          customer_id,
          asset_id,
          asset_name,
          asset_capacity_kwp,
          onboarding_date,
          onboarding_fee_paid,
          next_annual_due_date
        ) VALUES (
          contract_rec.user_id,
          contract_rec.contract_id,
          contract_rec.customer_id,
          asset.value->>'assetId',
          asset.value->>'assetName',
          COALESCE((asset.value->>'totalMW')::numeric * 1000, 0),
          onboarding_date,
          false,
          next_annual_due
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;