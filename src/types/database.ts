export interface KlaviyoConnection {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string
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
