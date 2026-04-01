'use client'

import Link from 'next/link'

import { cn } from '@/lib/utils'

const contentWidths = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  '4xl': 'max-w-4xl',
  full: 'max-w-full',
} as const

export type AuthSplitContentWidth = keyof typeof contentWidths

function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex items-center', className)}>
      {/* Native img avoids next/image SVG hydration quirks in split layouts */}
      <img
        src="/assets/logo-black.svg"
        alt="Mauk.ai"
        width={410}
        height={96}
        className="h-8 w-auto"
      />
    </Link>
  )
}

interface AuthSplitLayoutProps {
  children: React.ReactNode
  /** Shown below the mobile logo / top of the right column (e.g. step indicator). */
  header?: React.ReactNode
  /** Max width of the main content column on the right. */
  contentMaxWidth?: AuthSplitContentWidth
  /** Vertical alignment of the scrollable content area. */
  mainAlign?: 'center' | 'start'
}

export function AuthSplitLayout({
  children,
  header,
  contentMaxWidth = 'sm',
  mainAlign = 'center',
}: AuthSplitLayoutProps) {
  const widthClass = contentWidths[contentMaxWidth]

  return (
    <div className="grid h-svh min-h-0 w-full grid-cols-1 lg:grid-cols-2">
      {/* Left: fixed to viewport height, no scroll */}
      <div className="relative hidden h-full min-h-0 flex-col justify-between gap-10 overflow-hidden bg-muted p-10 text-muted-foreground lg:flex">
        <BrandMark />
        <div className="min-h-0 shrink-0">
          <blockquote className="flex flex-col gap-2">
            <p className="text-lg leading-relaxed text-foreground">
              &ldquo;This has saved me countless hours of work and helped me
              deliver polished email campaigns to clients faster than ever
              before.&rdquo;
            </p>
            <footer className="text-sm">Sofia Davis</footer>
          </blockquote>
        </div>
      </div>

      {/* Right: fills viewport; only the main region scrolls */}
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="shrink-0 lg:hidden">
          <div className="flex justify-center p-6 pb-0 md:p-10 md:pb-0">
            <BrandMark />
          </div>
        </div>

        {header ? (
          <div className="shrink-0 border-b border-border px-6 pb-3 pt-4 md:px-10 md:pb-4 md:pt-5 lg:pt-6">
            {header}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div
            className={cn(
              'px-6 md:px-10',
              header ? 'py-6 md:py-8' : 'pb-8 pt-0 md:pb-10 md:pt-6 lg:pt-10',
              mainAlign === 'center' && 'flex min-h-full flex-1 flex-col'
            )}
          >
            <div
              className={cn(
                'mx-auto w-full',
                widthClass,
                mainAlign === 'center' &&
                  'flex flex-1 flex-col justify-center'
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
