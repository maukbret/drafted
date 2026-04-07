-- Count successful pushes to Klaviyo (draft, schedule, or update) for UI hints on concept rows.

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS klaviyo_push_count INTEGER NOT NULL DEFAULT 0;

-- Best-effort history: campaigns that already have Klaviyo IDs were saved at least once.
UPDATE campaigns
SET klaviyo_push_count = 1
WHERE klaviyo_push_count = 0
  AND (klaviyo_campaign_id IS NOT NULL OR klaviyo_template_id IS NOT NULL);
