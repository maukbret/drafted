import { createClient } from '@/lib/supabase/server'
import { klaviyoFetch } from '@/lib/klaviyo'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { CampaignWizard } from '@/components/campaign-wizard'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft } from 'lucide-react'

interface CampaignPageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch the campaign first
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, user_id, klaviyo_connection_id, klaviyo_account_id, project_id, name, subject_line, preview_text, included_audiences, excluded_audiences, klaviyo_campaign_id, klaviyo_template_id, status, scheduled_at, send_in_recipient_timezone, wizard_step, figma_url, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error || !campaign) {
    notFound()
  }

  // Verify access: owner or team admin connection
  let hasAccess = campaign.user_id === user.id
  let teamMembership: { team_id: string } | null = null

  if (!hasAccess) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single()

    teamMembership = membership

    if (teamMembership) {
      const { data: adminMembers } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamMembership.team_id)
        .eq('role', 'admin')

      if (adminMembers && adminMembers.length > 0) {
        const { data: teamConnection } = await supabase
          .from('klaviyo_connections')
          .select('id')
          .eq('id', campaign.klaviyo_connection_id)
          .in('user_id', adminMembers.map(m => m.user_id))
          .single()

        if (teamConnection) {
          hasAccess = true
        }
      }
    }
  }

  if (!hasAccess) {
    notFound()
  }

  // Check if user can edit (only own campaigns)
  const canEdit = campaign.user_id === user.id

  // Fetch related data separately to avoid join issues
  const { data: klaviyoConnection } = await supabase
    .from('klaviyo_connections')
    .select('account_name')
    .eq('id', campaign.klaviyo_connection_id)
    .single()

  const { data: project } = campaign.project_id
    ? await supabase
        .from('projects')
        .select('*, frames(*)')
        .eq('id', campaign.project_id)
        .single()
    : { data: null }

  // Combine the data
  const campaignWithRelations = {
    ...campaign,
    klaviyo_connections: klaviyoConnection,
    projects: project,
  }

  // If campaign is already sent, scheduled, or cancelled, show a read-only view
  if (campaign.status === 'sent' || campaign.status === 'scheduled' || campaign.status === 'cancelled') {
    // Get frames for email preview
    const frames = project?.frames?.sort((a: any, b: any) => a.display_order - b.display_order) || []

    // Get audience info
    const includedAudiences = campaign.included_audiences || []
    const shouldUseKlaviyoSchedule = campaign.status === 'scheduled' || campaign.status === 'sent'
    let scheduledAtSource: string | null = campaign.scheduled_at

    if (shouldUseKlaviyoSchedule && campaign.klaviyo_campaign_id) {
      try {
        const klaviyoResponse = await klaviyoFetch(
          supabase,
          campaign.klaviyo_connection_id,
          `/api/campaigns/${campaign.klaviyo_campaign_id}`
        )

        if (klaviyoResponse?.ok) {
          const klaviyoData = await klaviyoResponse.json()
          const sendStrategy = klaviyoData?.data?.attributes?.send_strategy
          const klaviyoDatetime =
            sendStrategy?.datetime ||
            sendStrategy?.options_static?.datetime ||
            sendStrategy?.options_throttled?.datetime ||
            sendStrategy?.options?.datetime ||
            null

          if (klaviyoDatetime) {
            scheduledAtSource = klaviyoDatetime
          }
        } else {
          console.error('Failed to fetch Klaviyo campaign schedule:', klaviyoResponse?.status)
        }
      } catch (err) {
        console.error('Error fetching Klaviyo campaign schedule:', err)
      }
    }

    const formatAmsterdamDateTime = (value: string | null) => {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short',
      }).format(date)
      return `${formatted} (Europe/Amsterdam)`
    }

    const scheduledAtDisplay = formatAmsterdamDateTime(scheduledAtSource)

    return (
      <div className="p-8">
        <div className="mb-6">
          <Link
            href="/campaigns"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Campaigns
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <Badge
            variant="default"
            className={
              campaign.status === 'sent'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100'
                : campaign.status === 'scheduled'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100'
                  : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-100'
            }
          >
            {campaign.status === 'sent' ? 'Sent' : campaign.status === 'scheduled' ? 'Scheduled' : 'Cancelled'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left side: Campaign details */}
          <div>
            <Card>
              <CardContent className="p-0 divide-y">
                <div className="p-6">
                  <p className="text-sm text-muted-foreground mb-1">Subject line</p>
                  <p className="font-medium">{campaign.subject_line}</p>
                </div>
                {campaign.preview_text && (
                  <div className="p-6">
                    <p className="text-sm text-muted-foreground mb-1">Preview text</p>
                    <p>{campaign.preview_text}</p>
                  </div>
                )}
                {includedAudiences.length > 0 && (
                  <div className="p-6">
                    <p className="text-sm text-muted-foreground mb-2">Sent to</p>
                    <div className="flex flex-wrap gap-2">
                      {includedAudiences.map((audience: any) => (
                        <Badge key={audience.id} variant="secondary">
                          {audience.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {campaign.scheduled_at && (
                  <div className="p-6">
                    <p className="text-sm text-muted-foreground mb-1">
                      {campaign.status === 'sent'
                        ? 'Sent at'
                        : campaign.status === 'scheduled'
                          ? 'Scheduled for'
                          : 'Was scheduled for'}
                    </p>
                    <p>{scheduledAtDisplay || new Date(campaign.scheduled_at).toLocaleString('en-GB')}</p>
                  </div>
                )}
                {campaignWithRelations.klaviyo_connections?.account_name && (
                  <div className="p-6">
                    <p className="text-sm text-muted-foreground mb-1">Klaviyo account</p>
                    <p>{campaignWithRelations.klaviyo_connections.account_name}</p>
                  </div>
                )}
                <div className="p-6">
                  <p className="text-sm text-muted-foreground mb-1">Created</p>
                  <p>{new Date(campaign.created_at).toLocaleString('en-GB')}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right side: Email preview */}
          <div>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto bg-gray-100 pb-8">
                  {frames.length > 0 ? (
                    <div className="flex flex-col">
                      {frames.map((frame: any) => (
                        <img
                          key={frame.id}
                          src={frame.klaviyo_image_url || frame.image_url}
                          alt={frame.name}
                          className="w-full"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No preview available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Fetch Klaviyo connections for the wizard
  if (!teamMembership) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single()

    teamMembership = membership
  }

  // Get team name for shared connection labeling
  const { data: team } = teamMembership
    ? await supabase
        .from('teams')
        .select('name')
        .eq('id', teamMembership.team_id)
        .single()
    : { data: null }

  const { data: klaviyoConnections } = await supabase
    .from('klaviyo_connections')
    .select('id, account_name')
    .eq('user_id', user.id)

  // Get team admin's connections (if user is in a team)
  // Note: teamMembership is already fetched above
  let teamConnections: { id: string; account_name: string | null; owner_name?: string }[] = []
  if (teamMembership) {
    // Get admin members
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')

    if (adminMembers && adminMembers.length > 0) {
      const adminUserIds = adminMembers.map(m => m.user_id).filter(id => id !== user.id)

      if (adminUserIds.length > 0) {
        const { data: adminConnections } = await supabase
          .from('klaviyo_connections')
          .select('id, account_name, user_id')
          .in('user_id', adminUserIds)

        const fallbackTeamName = team?.name || 'Team'
        teamConnections = (adminConnections || []).map(conn => ({
          id: conn.id,
          account_name: conn.account_name,
          owner_name: fallbackTeamName,
        }))
      }
    }
  }

  // Check if Figma is connected
  const { data: figmaConnection } = await supabase
    .from('figma_connections')
    .select('id')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="p-8 min-h-[calc(100vh-var(--header-height,0px))] flex flex-col">
      <div className="mb-6 flex-shrink-0">
        <Link
          href="/campaigns"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Campaigns
        </Link>
      </div>

      <CampaignWizard
        campaign={campaignWithRelations}
        klaviyoConnections={klaviyoConnections || []}
        teamConnections={teamConnections}
        hasFigmaConnection={!!figmaConnection}
        campaignName={campaign.name === 'Untitled Campaign' ? 'New Campaign' : campaign.name}
      />
    </div>
  )
}
