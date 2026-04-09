'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { profileSeedFromOAuthUser } from '@/lib/auth/profile-seed'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { UserAvatar } from '@/components/user-avatar'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface InviteOptionalProfileStepProps {
  teamName: string
  onDone: () => void
}

export function InviteOptionalProfileStep({ teamName, onDone }: InviteOptionalProfileStepProps) {
  const [fullName, setFullName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setInitialLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()

      const seed = profileSeedFromOAuthUser(user)

      if (profile?.full_name) {
        setFullName(profile.full_name)
      } else if (seed.full_name) {
        setFullName(seed.full_name)
      }

      if (profile?.avatar_url) {
        setAvatarPreview(profile.avatar_url)
        setExistingAvatarUrl(profile.avatar_url)
      } else if (seed.avatar_url) {
        setAvatarPreview(seed.avatar_url)
        setExistingAvatarUrl(seed.avatar_url)
      }

      setInitialLoading(false)
    }

    void load()
  }, [supabase])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB')
      return
    }
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
    setError(null)
  }

  const handleSave = async () => {
    const trimmed = fullName.trim()
    if (!trimmed && !avatarFile) {
      toast.message('Skipped profile details', {
        description: 'You can update your name and photo anytime in settings.',
      })
      onDone()
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let finalAvatarUrl: string | null = existingAvatarUrl

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const filePath = `${user.id}/avatar.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true })

        if (uploadError) {
          console.error('Avatar upload error:', uploadError)
        } else {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(filePath)
          finalAvatarUrl = pub.publicUrl
        }
      }

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (trimmed) {
        patch.full_name = trimmed
      }
      if (avatarFile && finalAvatarUrl) {
        patch.avatar_url = finalAvatarUrl
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)

      if (profileError) {
        throw new Error(profileError.message)
      }

      if (trimmed) {
        await supabase.auth.updateUser({
          data: { full_name: trimmed },
        })
      }

      toast.success('Profile updated')
      onDone()
    } catch (err) {
      console.error('Invite optional profile save:', err)
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-xl font-semibold">Your profile (optional)</h2>
        <p className="text-sm text-muted-foreground">
          You joined <span className="font-medium text-foreground">{teamName}</span>. Add how you
          want to appear to teammates, or skip and do this later in settings.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <UserAvatar
            name={fullName || 'User'}
            imageUrl={avatarPreview}
            className="size-24 border-2 border-muted"
            fallbackClassName="text-lg"
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-6 w-6 text-white" />
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
        <p className="text-xs text-muted-foreground">Click to add or change photo</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-opt-name">Display name</Label>
        <Input
          id="invite-opt-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={loading} onClick={() => onDone()}>
          Skip for now
        </Button>
        <Button type="button" disabled={loading} onClick={() => void handleSave()}>
          {loading ? (
            <>
              <Loader2 data-icon="inline-start" className="animate-spin" />
              Saving…
            </>
          ) : (
            'Save and continue'
          )}
        </Button>
      </div>
    </div>
  )
}
