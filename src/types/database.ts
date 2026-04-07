export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  onboarding_completed: boolean
  onboarding_step: number
  subscription_selected: boolean
  created_at: string
  updated_at: string
}

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'unpaid'
  | 'paused'

export type SubscriptionTier = 'starter' | 'advanced' | 'pro'

export interface Subscription {
  id: string
  user_id: string
  stripe_subscription_id: string
  stripe_customer_id: string
  status: SubscriptionStatus
  price_id: string | null
  price_tier: SubscriptionTier | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  trial_start: string | null
  trial_end: string | null
  created_at: string
  updated_at: string
}

export interface StripeCustomer {
  id: string
  user_id: string
  stripe_customer_id: string
  created_at: string
  updated_at: string
}

export interface KlaviyoConnection {
  id: string
  user_id: string
  klaviyo_account_id: string | null
  account_name: string
  store_url: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface KlaviyoAnalyticsData {
  totalRevenue: number
  compTotalRevenue: number
  attributedRevenue: number
  compAttributedRevenue: number
  campaigns: KlaviyoAnalyticsCampaign[]
  compCampaigns: KlaviyoAnalyticsCampaign[]
  flows: KlaviyoAnalyticsFlow[]
  compFlows: KlaviyoAnalyticsFlow[]
  activeProfiles?: number | null
  newSubscribers?: number | null
  unsubscribers?: number | null
  netGrowth?: number | null
  netGrowthPercent?: number | null
  accountOverview?: {
    months: string[]
    campaignRevenue: number[]
    flowRevenue: number[]
    campaignOpenRate: number[]
    flowOpenRate: number[]
    campaignClickRate: number[]
    flowClickRate: number[]
  } | null
}

export interface KlaviyoAnalyticsCampaign {
  id: string
  name: string
  revenue: number
  openRate: number
  clickRate: number
  deliveredCount: number
}

export interface KlaviyoAnalyticsFlow {
  id: string
  name: string
  revenue: number
  openRate: number
  clickRate: number
  deliveredCount: number
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

export interface KlaviyoDefaultAudience {
  id: string
  user_id: string
  klaviyo_account_id: string
  preset_name: string
  included_audiences: KlaviyoAudience[]
  excluded_audiences: KlaviyoAudience[]
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
  /** Full-bleed image for slice mode (survives finalize) */
  slice_master_image_url?: string | null
  /** Serialized slicer state for re-opening step 2 */
  slice_layout_json?: unknown | null
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
  /** Incremented on each successful export/send to Klaviyo (draft, schedule, or update). */
  klaviyo_push_count?: number

  status: 'in_progress' | 'klaviyo_draft' | 'scheduled' | 'cancelled' | 'sent' | 'error'
  last_status_synced_at?: string | null
  scheduled_at: string | null
  send_in_recipient_timezone: boolean
  slice_mode: boolean
  /** When true, exported Klaviyo template is hybrid (USER_DRAGGABLE) with a DnD slot above the footer */
  klaviyo_hybrid_dnd_slot?: boolean
  wizard_step: number
  figma_url: string | null
  utm_settings: {
    enabled: boolean
    source: string
    medium: string
    campaign: string
    content: string
    term: string
  } | null

  is_hidden: boolean

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

export interface AnalyticsReport {
  id: string
  user_id: string
  connection_id: string | null
  title: string
  account_label: string
  period_start: string | null
  period_end: string | null
  compare_start: string | null
  compare_end: string | null
  period_month: string
  compare_month: string
  include_list_growth: boolean
  add_summary: boolean
  include_action_items: boolean
  status: 'ready'
  analytics_data: KlaviyoAnalyticsData
  fetched_at: string
  created_at: string
  ai_status?: 'idle' | 'generating' | 'ready' | 'failed'
  ai_insights?: Record<string, unknown> | null
  ai_model?: string | null
  ai_generated_at?: string | null
  ai_error?: string | null
}
