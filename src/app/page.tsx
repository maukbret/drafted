import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import myLogo from '@/assets/logo.png'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/campaigns')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <Image src={myLogo} alt="logo" className="loginLogo"></Image>
          <p className="mt-4 text-lg text-muted-foreground loginText">
            Transform your Figma email designs into Klaviyo drafts in seconds.
          </p>
        </div>

        <div className="space-y-4">
          <Button asChild className="w-full" size="lg">
            <Link href="/login">Get started</Link>
          </Button>
        </div>

        <div className="pt-8 border-t">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            How it works
          </h2>
          <ol className="text-left space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-foreground">1.</span>
              Connect your Klaviyo account
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-foreground">2.</span>
              Paste your Figma design URL
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-foreground">3.</span>
              Add links to each section
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-foreground">4.</span>
              Export as a Klaviyo draft
            </li>
          </ol>
        </div>
      </div>
    </main>
  )
}

