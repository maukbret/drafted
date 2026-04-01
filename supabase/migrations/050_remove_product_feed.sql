-- Product feed feature removed: drop preset table and campaign JSON column.
DROP TABLE IF EXISTS product_feed_presets;

ALTER TABLE campaigns DROP COLUMN IF EXISTS product_feed_settings;
