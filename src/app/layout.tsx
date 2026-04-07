import type { Metadata } from 'next'
import { AgentationWrapper } from '@/components/agentation-wrapper'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mauk.ai - Figma to Klaviyo',
  description: 'Transform Figma designs into Klaviyo email drafts',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
        <AgentationWrapper />
        <Toaster />
        <SonnerToaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
