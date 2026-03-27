'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/user-avatar'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProfileStepProps {
  onComplete: () => void
  /** Static UI preview — skips API calls. */
  isPreview?: boolean
}

export function ProfileStep({ onComplete, isPreview = false }: ProfileStepProps) {
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
    if (isPreview) {
      setInitialLoading(false)
      return
    }

    const loadProfile = async () => {
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

      // Pre-fill name if available from auth metadata
      if (user.user_metadata?.full_name) {
        setFullName(user.user_metadata.full_name)
      } else if (profile?.full_name) {
        setFullName(profile.full_name)
      }

      // Pre-fill avatar if available
      if (profile?.avatar_url) {
        setAvatarPreview(profile.avatar_url)
        setExistingAvatarUrl(profile.avatar_url)
      }

      setInitialLoading(false)
    }

    loadProfile()
  }, [supabase, isPreview])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
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
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isPreview) {
      toast.message('Preview mode', {
        description: 'Saving profile is disabled on this static preview page.',
      })
      return
    }

    if (!fullName.trim()) {
      setError('Full name is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      // Determine avatar URL to save
      let finalAvatarUrl: string | null = existingAvatarUrl

      // Upload new avatar if provided
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const filePath = `${user.id}/avatar.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true })

        if (uploadError) {
          console.error('Avatar upload error:', uploadError)
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath)
          finalAvatarUrl = publicUrl
        }
      }

      // Update profile and set onboarding step
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: fullName.trim(),
          avatar_url: finalAvatarUrl,
          onboarding_step: 2,
          updated_at: new Date().toISOString(),
        })

      if (profileError) {
        throw new Error(`Failed to save profile: ${profileError.message}`)
      }

      // Update auth user metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim() }
      })

      onComplete()
    } catch (err) {
      console.error('Profile save error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-left space-y-1">
        <h1 className="text-2xl font-semibold">Set up your profile</h1>
        <p className="text-muted-foreground">
          Let&apos;s set up your profile to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar upload */}
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
          >
            <UserAvatar
              name={fullName || 'User'}
              imageUrl={avatarPreview}
              className="h-24 w-24 border-2 border-muted"
              fallbackClassName="text-lg"
            />
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
          <p className="text-xs text-muted-foreground">
            Click to add a profile photo
          </p>
        </div>

        {/* Full name */}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name <span className="text-destructive">*</span></Label>
          <Input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            required
            autoFocus
          />
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </form>
    </div>
  )
}
