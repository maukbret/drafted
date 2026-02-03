export interface KlaviyoConnection {
  id: string
  user_id: string
  klaviyo_account_id: string | null
  account_name: string
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string
  created_at: string
  updated_at: string
}

export interface KlaviyoFooter {
  id: string
  user_id: string
  klaviyo_account_id: string
  footer_html: string
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  figma_url: string
  figma_file_key: string
  figma_node_id: string
  status: 'processing' | 'ready' | 'exported' | 'error'
  created_at: string
  updated_at: string
}

export interface Frame {
  id: string
  project_id: string
  figma_node_id: string
  name: string
  width: number | null
  image_url: string | null
  klaviyo_image_url: string | null
  link_url: string | null
  display_order: number
  created_at: string
}

export interface Campaign {
  id: string
  user_id: string
  klaviyo_connection_id: string | null
  klaviyo_account_id: string | null
  project_id: string | null

  name: string
  subject_line: string
  preview_text: string | null

  included_audiences: KlaviyoAudience[]
  excluded_audiences: KlaviyoAudience[]

  klaviyo_campaign_id: string | null
  klaviyo_template_id: string | null

  status: 'in_progress' | 'klaviyo_draft' | 'scheduled' | 'sent' | 'error'
  scheduled_at: string | null
  send_in_recipient_timezone: boolean
  wizard_step: number
  figma_url: string | null

  created_at: string
  updated_at: string
}

export interface KlaviyoAudience {
  id: string
  name: string
  type: 'list' | 'segment'
}

export interface Team {
  id: string
  name: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
}

export interface TeamInvitation {
  id: string
  team_id: string
  email: string | null
  token: string
  invited_by: string | null
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  expires_at: string
  created_at: string
}

export interface TeamMemberWithProfile extends TeamMember {
  profiles?: {
    full_name: string | null
    avatar_url: string | null
  } | null
  email?: string
}

export interface TeamWithMembers extends Team {
  team_members?: TeamMemberWithProfile[]
}
