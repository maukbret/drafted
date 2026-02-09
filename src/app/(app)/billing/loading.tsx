import { PageHeader } from '@/components/page-header'
import { ContentSpinner } from '@/components/content-spinner'

export default function BillingLoading() {
  return (
    <div className="p-8">
      <PageHeader
        title="Billing"
        subtitle="Manage your subscription and billing"
      />
      <ContentSpinner />
    </div>
  )
}
