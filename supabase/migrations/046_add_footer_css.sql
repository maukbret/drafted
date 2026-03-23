-- Add footer_css column to store preserved media queries / responsive CSS
-- extracted from the original Klaviyo email's <head> <style> block.
ALTER TABLE klaviyo_footers
ADD COLUMN IF NOT EXISTS footer_css TEXT;
