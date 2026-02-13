import { CampaignListSkeleton } from '@/components/campaign-list-skeleton'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'

export default function CampaignsLoading() {
  return (
    <div className="p-8">
      <PageHeader
        title="Campaigns"
        subtitle="Create and send email campaigns through Klaviyo"
      >
        <Button variant="outline" size="icon" disabled className="h-9 w-9">
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Button disabled>
          <Plus className="h-4 w-4 buttonIcon" />
          New campaign
        </Button>
      </PageHeader>
      <CampaignListSkeleton />
    </div>
  )
}
