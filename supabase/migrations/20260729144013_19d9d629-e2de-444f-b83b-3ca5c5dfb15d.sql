UPDATE public.contracts
SET zero_pv_alert_enabled = true
WHERE elum_tier IS NOT NULL
   OR package IN ('elum_ci_lite', 'elum_ci_pro', 'elum_utility');