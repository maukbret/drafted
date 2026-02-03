'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Camera, Loader2, User } from 'lucide-react'

export default function OnboardingPage() {
  const [fullName, setFullName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const supabase = createClient()

  // Check if user is authenticated and needs onboarding
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // Check if onboarding is already completed
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, full_name, avatar_url')
        .eq('id', user.id)
        .single()

      if (profile?.onboarding_completed) {
        router.push('/campaigns')
        return
      }

      // Pre-fill name if available from auth metadata
      if (user.user_metadata?.full_name) {
        setFullName(user.user_metadata.full_name)
      } else if (profile?.full_name) {
        setFullName(profile.full_name)
      }

      // Pre-fill avatar if available (track both preview and existing URL separately)
      if (profile?.avatar_url) {
        setAvatarPreview(profile.avatar_url)
        setExistingAvatarUrl(profile.avatar_url)
      }

      setCheckingAuth(false)
    }

    checkUser()
  }, [supabase, router])

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
          // Continue with existing avatar if upload fails
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath)
          finalAvatarUrl = publicUrl
        }
      }

      // Update profile with name and avatar (upsert creates if doesn't exist)
      const profileData = {
        id: user.id,
        full_name: fullName.trim(),
        avatar_url: finalAvatarUrl,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }

      console.log('Saving profile:', profileData)

      const { data: savedProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData)
        .select()
        .single()

      if (profileError) {
        console.error('Profile save error:', profileError)
        throw new Error(`Failed to save profile: ${profileError.message}`)
      }

      console.log('Profile saved successfully:', savedProfile)

      // Also update auth user metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim() }
      })

      router.push('/campaigns')
      router.refresh()
    } catch (err) {
      console.error('Onboarding error:', err)
      setError(err instanceof Error ? err.message : 'Failed to complete setup')
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl">Welcome to Drafted</CardTitle>
            <CardDescription>
              Let&apos;s set up your profile to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
                >
                  <Avatar className="h-24 w-24 border-2 border-muted">
                    <AvatarImage src={avatarPreview || undefined} />
                    <AvatarFallback className="bg-muted text-lg">
                      {fullName ? getInitials(fullName) : <User className="h-8 w-8 text-muted-foreground" />}
                    </AvatarFallback>
                  </Avatar>
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
                <p className="text-sm text-muted-foreground">
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
                    Setting up...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
