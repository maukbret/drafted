import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AgentationWrapper } from '@/components/agentation-wrapper'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Drafted - Figma to Klaviyo',
  description: 'Transform Figma designs into Klaviyo email drafts',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased min-h-screen">
        {children}
        <AgentationWrapper />
        <Toaster />
        <SonnerToaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
