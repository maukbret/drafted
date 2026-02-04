'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const AVATAR_PALETTE = [
  { bgClassName: 'bg-orange-100', textClassName: 'text-orange-700' },
  { bgClassName: 'bg-amber-100', textClassName: 'text-amber-700' },
  { bgClassName: 'bg-yellow-100', textClassName: 'text-yellow-700' },
  { bgClassName: 'bg-lime-100', textClassName: 'text-lime-700' },
  { bgClassName: 'bg-emerald-100', textClassName: 'text-emerald-700' },
  { bgClassName: 'bg-teal-100', textClassName: 'text-teal-700' },
  { bgClassName: 'bg-cyan-100', textClassName: 'text-cyan-700' },
  { bgClassName: 'bg-sky-100', textClassName: 'text-sky-700' },
  { bgClassName: 'bg-blue-100', textClassName: 'text-blue-700' },
  { bgClassName: 'bg-indigo-100', textClassName: 'text-indigo-700' },
  { bgClassName: 'bg-violet-100', textClassName: 'text-violet-700' },
  { bgClassName: 'bg-pink-100', textClassName: 'text-pink-700' },
] as const

function getAvatarInitial(name: string) {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

function getAvatarPalette(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

interface UserAvatarProps {
  name?: string | null
  imageUrl?: string | null
  className?: string
  fallbackClassName?: string
}

export function UserAvatar({ name, imageUrl, className, fallbackClassName }: UserAvatarProps) {
  const normalizedName = (name || '').trim() || 'User'
  const palette = getAvatarPalette(normalizedName)

  return (
    <Avatar className={className}>
      <AvatarImage src={imageUrl || undefined} alt={normalizedName} />
      <AvatarFallback
        className={cn('font-semibold', palette.bgClassName, palette.textClassName, fallbackClassName)}
      >
        {getAvatarInitial(normalizedName)}
      </AvatarFallback>
    </Avatar>
  )
}
