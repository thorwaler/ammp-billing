-- Add portfolio discount tiers and minimum charge tiers columns to contracts table
ALTER TABLE public.contracts 
ADD COLUMN portfolio_discount_tiers jsonb DEFAULT '[]'::jsonb,
ADD COLUMN minimum_charge_tiers jsonb DEFAULT '[]'::jsonb;

-- Migrate existing volume_discounts data to portfolio_discount_tiers
UPDATE public.contracts
SET portfolio_discount_tiers = jsonb_build_array(
  jsonb_build_object(
    'minMW', 0,
    'maxMW', 49.99,
    'discountPercent', 0,
    'label', '0-49 MW'
  ),
  jsonb_build_object(
    'minMW', 50,
    'maxMW', 99.99,
    'discountPercent', COALESCE((volume_discounts->>'portfolio50MW')::numeric, 5),
    'label', '50-99 MW'
  ),
  jsonb_build_object(
    'minMW', 100,
    'maxMW', 149.99,
    'discountPercent', COALESCE((volume_discounts->>'portfolio100MW')::numeric, 10),
    'label', '100-149 MW'
  ),
  jsonb_build_object(
    'minMW', 150,
    'maxMW', 199.99,
    'discountPercent', COALESCE((volume_discounts->>'portfolio150MW')::numeric, 15),
    'label', '150-199 MW'
  ),
  jsonb_build_object(
    'minMW', 200,
    'maxMW', null,
    'discountPercent', COALESCE((volume_discounts->>'portfolio200MW')::numeric, 20),
    'label', '200+ MW'
  )
)
WHERE portfolio_discount_tiers = '[]'::jsonb;

-- Migrate existing minimum_charge to minimum_charge_tiers
UPDATE public.contracts
SET minimum_charge_tiers = jsonb_build_array(
  jsonb_build_object(
    'minMW', 0,
    'maxMW', 49.99,
    'chargePerSite', COALESCE(minimum_charge, 0),
    'label', '0-49 MW'
  ),
  jsonb_build_object(
    'minMW', 50,
    'maxMW', 99.99,
    'chargePerSite', COALESCE(minimum_charge, 0),
    'label', '50-99 MW'
  ),
  jsonb_build_object(
    'minMW', 100,
    'maxMW', 149.99,
    'chargePerSite', COALESCE(minimum_charge, 0),
    'label', '100-149 MW'
  ),
  jsonb_build_object(
    'minMW', 150,
    'maxMW', 199.99,
    'chargePerSite', COALESCE(minimum_charge, 0),
    'label', '150-199 MW'
  ),
  jsonb_build_object(
    'minMW', 200,
    'maxMW', null,
    'chargePerSite', COALESCE(minimum_charge, 0),
    'label', '200+ MW'
  )
)
WHERE minimum_charge_tiers = '[]'::jsonb;