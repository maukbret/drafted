-- Add price_tier column to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_tier text
  CHECK (price_tier IN ('starter', 'advanced', 'pro'));

-- Create function to get Klaviyo connection limit for a user
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
    RETURN 20;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- Create function to count current Klaviyo connections for a user
CREATE OR REPLACE FUNCTION count_klaviyo_connections(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM klaviyo_connections
  WHERE user_id = p_user_id;

  RETURN v_count;
END;
$$;

-- Create function to check if user can add more Klaviyo connections
CREATE OR REPLACE FUNCTION can_add_klaviyo_connection(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  v_limit := get_klaviyo_connection_limit(p_user_id);
  v_count := count_klaviyo_connections(p_user_id);

  RETURN v_count < v_limit;
END;
$$;
