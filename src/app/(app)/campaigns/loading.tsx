import { CampaignListSkeleton } from '@/components/campaign-list-skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, RefreshCw, Search } from 'lucide-react'

export default function CampaignsLoading() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and send email campaigns through Klaviyo
          </p>
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </div>
      <CampaignListSkeleton />
    </div>
  )
}
