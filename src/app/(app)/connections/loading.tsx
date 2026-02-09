import { PageHeader } from '@/components/page-header'
import { ContentSpinner } from '@/components/content-spinner'

export default function ConnectionsLoading() {
  return (
    <div className="p-8">
      <PageHeader
        title="Connections"
        subtitle="Manage your Klaviyo and Figma integrations"
      />
      <ContentSpinner />
    </div>
  )
}
