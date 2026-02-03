import { createClient } from '@/lib/supabase/server'
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

  // Get user's team membership
  const { data: teamMembership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single()

  // Get team name for shared connection labeling
  const { data: team } = teamMembership
    ? await supabase
        .from('teams')
        .select('name')
        .eq('id', teamMembership.team_id)
        .single()
    : { data: null }

  // Get user's own Klaviyo connections
  const { data: ownConnections } = await supabase
    .from('klaviyo_connections')
    .select('id')
    .eq('user_id', user.id)

  const ownConnectionIds = ownConnections?.map(c => c.id) || []

  // Get team admin's connections if user is in a team
  let teamConnectionIds: string[] = []
  if (teamMembership) {
    const { data: adminMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamMembership.team_id)
      .eq('role', 'admin')

    if (adminMembers && adminMembers.length > 0) {
      const { data: teamConnections } = await supabase
        .from('klaviyo_connections')
        .select('id')
        .in('user_id', adminMembers.map(m => m.user_id))

      teamConnectionIds = teamConnections?.map(c => c.id) || []
    }
  }

  // All connection IDs the user has access to
  const accessibleConnectionIds = [...new Set([...ownConnectionIds, ...teamConnectionIds])]

  // Fetch the campaign - only allow viewing if user has access to its connection
  const { data: campaign, error } = accessibleConnectionIds.length > 0
    ? await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .in('klaviyo_connection_id', accessibleConnectionIds)
        .single()
    : { data: null, error: { message: 'No accessible connections' } }

  if (error || !campaign) {
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

  // If campaign is already sent or scheduled, show a read-only view
  if (campaign.status === 'sent' || campaign.status === 'scheduled') {
    // Get frames for email preview
    const frames = project?.frames?.sort((a: any, b: any) => a.display_order - b.display_order) || []

    // Get audience info
    const includedAudiences = campaign.included_audiences || []

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
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100'
            }
          >
            {campaign.status === 'sent' ? 'Sent' : 'Scheduled'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left side: Campaign details */}
          <div>
            <Card>
              <CardContent className="p-0 divide-y">
                <div className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Subject line</p>
                  <p className="font-medium">{campaign.subject_line}</p>
                </div>
                {campaign.preview_text && (
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">Preview text</p>
                    <p>{campaign.preview_text}</p>
                  </div>
                )}
                {includedAudiences.length > 0 && (
                  <div className="p-4">
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
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      {campaign.status === 'sent' ? 'Sent at' : 'Scheduled for'}
                    </p>
                    <p>{new Date(campaign.scheduled_at).toLocaleString('en-GB')}</p>
                  </div>
                )}
                {campaignWithRelations.klaviyo_connections?.account_name && (
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">Klaviyo account</p>
                    <p>{campaignWithRelations.klaviyo_connections.account_name}</p>
                  </div>
                )}
                <div className="p-4">
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
                <div className="max-h-[600px] overflow-y-auto bg-gray-100">
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
