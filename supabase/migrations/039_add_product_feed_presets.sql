-- Product feed presets: stores styling configuration per user per Klaviyo account
CREATE TABLE IF NOT EXISTS product_feed_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  klaviyo_account_id TEXT NOT NULL,
  layout TEXT NOT NULL DEFAULT '2-column',
  button_color TEXT NOT NULL DEFAULT '#000000',
  button_text_color TEXT NOT NULL DEFAULT '#ffffff',
  button_text TEXT NOT NULL DEFAULT 'Shop now',
  show_price BOOLEAN NOT NULL DEFAULT true,
  show_title BOOLEAN NOT NULL DEFAULT true,
  image_ratio TEXT NOT NULL DEFAULT 'square',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, klaviyo_account_id)
);

ALTER TABLE product_feed_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own presets" ON product_feed_presets
  FOR ALL USING (auth.uid() = user_id);

-- Campaign-level product feed settings (feed name + product count)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS product_feed_settings JSONB DEFAULT NULL;
