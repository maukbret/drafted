import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export default function CampaignsLoading() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-5 gap-4 border-b px-4 py-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 px-4 h-[52px] items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
