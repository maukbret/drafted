-- Add send_in_recipient_timezone column to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS send_in_recipient_timezone BOOLEAN DEFAULT FALSE;
