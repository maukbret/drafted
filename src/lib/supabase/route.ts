import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

type CookieToSet = { name: string; value: string; options: any }

export function createRouteHandlerClient(request: NextRequest) {
  const cookiesToSet: CookieToSet[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookies) {
          cookiesToSet.push(...cookies)
        },
      },
    }
  )

  const applyCookies = (response: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options)
    )
    return response
  }

  return { supabase, applyCookies }
}
