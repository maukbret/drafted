-- Pro tier: raise Klaviyo account limit from 20 to 40 (must match app tierLimits / TIER_CONFIGS)
CREATE OR REPLACE FUNCTION get_klaviyo_connection_limit(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
BEGIN
  SELECT price_tier INTO v_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_tier IS NULL THEN
    RETURN 0;
  ELSIF v_tier = 'starter' THEN
    RETURN 1;
  ELSIF v_tier = 'advanced' THEN
    RETURN 5;
  ELSIF v_tier = 'pro' THEN
    RETURN 40;
  ELSE
    RETURN 0;
  END IF;
END;
$$;
