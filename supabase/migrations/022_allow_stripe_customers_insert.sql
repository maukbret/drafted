-- Allow authenticated users to create their own stripe customer mapping

CREATE POLICY "Users can create own stripe customer" ON stripe_customers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

