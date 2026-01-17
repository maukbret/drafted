import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Figma → Klaviyo
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Transform your Figma email designs into Klaviyo drafts in seconds.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/login"
            className="block w-full rounded-lg bg-black px-4 py-3 text-white font-medium hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors"
          >
            Get started
          </Link>
        </div>

        <div className="pt-8 border-t border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            How it works
          </h2>
          <ol className="text-left space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex gap-3">
              <span className="font-mono text-black dark:text-white">1.</span>
              Connect your Klaviyo account
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-black dark:text-white">2.</span>
              Paste your Figma design URL
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-black dark:text-white">3.</span>
              Add links to each section
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-black dark:text-white">4.</span>
              Export as a Klaviyo draft
            </li>
          </ol>
        </div>
      </div>
    </main>
  )
}

