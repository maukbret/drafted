import { PageHeader } from '@/components/page-header'
import { ContentSpinner } from '@/components/content-spinner'

export default function TeamLoading() {
  return (
    <div className="p-8">
      <PageHeader
        title="Team"
        subtitle="Manage your team and invite members"
      />
      <ContentSpinner />
    </div>
  )
}
