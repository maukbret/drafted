-- Add width column to frames table for side-by-side layout detection
ALTER TABLE frames ADD COLUMN width INTEGER;

-- Frames with width <= 300px (50% of 600px email width) can be displayed side-by-side
