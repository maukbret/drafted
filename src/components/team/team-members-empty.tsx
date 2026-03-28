'use client'

import { UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TeamMembersEmptyProps {
  onInviteClick: () => void
}

export function TeamMembersEmpty({ onInviteClick }: TeamMembersEmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-xl border border-dashed border-muted-foreground/20 bg-muted/10 p-6 sm:flex-row sm:items-center sm:gap-8',
      )}
    >
      <div className="flex shrink-0 pl-1">
        <Avatar className="relative z-[3] size-11 border-2 border-background">
          <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
            ?
          </AvatarFallback>
        </Avatar>
        <Avatar className="relative z-[2] -ml-3 size-11 border-2 border-background">
          <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
            +
          </AvatarFallback>
        </Avatar>
        <Avatar className="relative z-[1] -ml-3 size-11 border-2 border-background">
          <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
            T
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-lg font-semibold tracking-tight">No team members yet</h3>
        <p className="text-sm text-muted-foreground">
          Invite your team to collaborate on campaigns and shared Klaviyo connections.
        </p>
        <div>
          <Button onClick={onInviteClick} className="rounded-full">
            <UserPlus data-icon="inline-start" />
            Invite members
          </Button>
        </div>
      </div>
    </div>
  )
}
