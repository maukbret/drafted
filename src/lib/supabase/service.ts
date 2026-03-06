import { createClient } from '@supabase/supabase-js'

/**
 * Service role client — bypasses RLS.
 * Only use inside server-side background jobs (e.g. next/server after() callbacks)
 * where no user session is available.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
