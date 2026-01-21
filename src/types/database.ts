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

  status: 'draft' | 'ready' | 'scheduled' | 'sent' | 'error'
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
