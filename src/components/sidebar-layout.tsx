'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserSettingsModal } from './user-settings-modal'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/user-avatar'
import { Mail, Image, Link2, Settings, LogOut, Users, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserProfile {
  full_name: string | null
  avatar_url: string | null
}

interface SidebarLayoutProps {
  children: React.ReactNode
  userEmail: string
  profile: UserProfile | null
}

export function SidebarLayout({ children, userEmail, profile }: SidebarLayoutProps) {
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const displayName = profile?.full_name || userEmail
  const avatarUrl = profile?.avatar_url || null

  const navItems = [
    { href: '/campaigns', label: 'Campaigns', icon: Mail },
    { href: '/images', label: 'Upload images', icon: Image },
    { href: '/connections', label: 'Connections', icon: Link2 },
    { href: '/team', label: 'Team', icon: Users },
    { href: '/billing', label: 'Billing', icon: CreditCard },
  ]

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r bg-muted/30 sticky top-0 h-screen">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-5 pt-5 pb-2">
            <img className="logo-img" src="/assets/logo-black.svg" width="116px" alt="logo" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-2 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-foreground shadow-sm-sm nav-active'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User */}
          <div className="p-3 border-t">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-background transition-colors text-left"
            >
              <UserAvatar
                name={displayName}
                imageUrl={avatarUrl}
                className="h-8 w-8"
                fallbackClassName="text-xs"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
                {profile?.full_name && (
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                )}
              </div>
              <Settings className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="w-full justify-start mt-2 text-muted-foreground"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* Settings Modal */}
      <UserSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentName={profile?.full_name || ''}
        currentAvatarUrl={avatarUrl}
        userEmail={userEmail}
      />
    </div>
  )
}
