import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { AgentationWrapper } from '@/components/agentation-wrapper'
import './globals.css'

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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased min-h-screen">
        {children}
        <AgentationWrapper />
      </body>
    </html>
  )
}
