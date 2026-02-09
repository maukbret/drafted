import { CampaignListSkeleton } from '@/components/campaign-list-skeleton'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, RefreshCw, Search } from 'lucide-react'

export default function CampaignsLoading() {
  return (
    <div className="p-8">
      <PageHeader
        title="Campaigns"
        subtitle="Create and send email campaigns through Klaviyo"
      >
        <div className="flex items-center">
          <div className="w-72 mr-2">
            <Input
              value=""
              placeholder="Search campaigns..."
              className="h-9"
              disabled
              readOnly
            />
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled>
            <Search className="h-4 w-4" />
          </Button>
        </div>

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
