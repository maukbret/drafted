'use client'

import { useState } from 'react'
import { getGoogleFaviconUrl, getStoreDomain } from '@/lib/store-url'

interface BrandIconProps {
  accountName?: string | null
  storeUrl?: string | null
  className?: string
}

function getInitial(value: string | null | undefined) {
  const first = (value || '').trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

export function BrandIcon({ accountName, storeUrl, className = 'h-5 w-5' }: BrandIconProps) {
  const domain = getStoreDomain(storeUrl)
  const initial = getInitial(accountName)
  const [failedDomain, setFailedDomain] = useState<string | null>(null)
  const hasFavicon = !!domain && failedDomain !== domain

  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden rounded-sm text-[10px] font-semibold ${hasFavicon ? 'bg-transparent' : 'bg-black text-white'} ${className}`}
      aria-hidden="true"
    >
      {hasFavicon ? (
        <img
          src={getGoogleFaviconUrl(domain, 128)}
          alt=""
          className="h-full w-full"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedDomain(domain)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
