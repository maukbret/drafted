-- Optional Klaviyo hybrid (USER_DRAGGABLE) region between design and footer for manual DnD blocks
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS klaviyo_hybrid_dnd_slot boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN campaigns.klaviyo_hybrid_dnd_slot IS 'When true, export inserts a Klaviyo hybrid editor slot and creates template as USER_DRAGGABLE';
