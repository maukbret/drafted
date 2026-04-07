-- Preserve full-bleed source + slicer state for slice-mode campaigns (re-edit step 2)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS slice_master_image_url text,
ADD COLUMN IF NOT EXISTS slice_layout_json jsonb;

COMMENT ON COLUMN projects.slice_master_image_url IS 'Full email image URL for slice mode (persists after finalize)';
COMMENT ON COLUMN projects.slice_layout_json IS 'Last saved SliceDefinition[] for restoring the slicer UI';
