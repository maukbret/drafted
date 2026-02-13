import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function CampaignListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-[72px] rounded-md" />
        <Skeleton className="h-9 w-[128px] rounded-md" />
        <Skeleton className="h-9 w-[92px] rounded-md" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-md" />
        <Skeleton className="h-10 w-full sm:w-[260px]" />
      </div>

      <div className="rounded-md border p-2">
        <Table className="table-fixed min-w-[760px] sm:min-w-[860px] lg:min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px] sm:w-[180px] lg:w-[200px] bg-muted/35 first:rounded-l-md">
                Klaviyo account
              </TableHead>
              <TableHead className="w-[200px] sm:w-[240px] lg:w-[300px] bg-muted/35">
                Campaign name
              </TableHead>
              <TableHead className="w-[64px] sm:w-[120px] lg:w-[170px] bg-muted/35">
                Created by
              </TableHead>
              <TableHead className="w-[110px] sm:w-[120px] lg:w-[130px] bg-muted/35">
                Last updated
              </TableHead>
              <TableHead className="w-[100px] sm:w-[110px] lg:w-[120px] bg-muted/35">
                Status
              </TableHead>
              <TableHead className="w-[56px] sm:w-[64px] bg-muted/35 last:rounded-r-md">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {Array.from({ length: rows }).map((_, index) => (
              <TableRow key={index} className="h-[56px]">
                <TableCell className="w-[160px] sm:w-[180px] lg:w-[200px]">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-sm" />
                    <Skeleton className="h-4 w-[70%]" />
                  </div>
                </TableCell>
                <TableCell className="w-[200px] sm:w-[240px] lg:w-[300px]">
                  <Skeleton className="h-4 w-[85%]" />
                </TableCell>
                <TableCell className="w-[64px] sm:w-[120px] lg:w-[170px]">
                  <div className="inline-flex items-center gap-2">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <Skeleton className="hidden h-4 w-16 sm:block" />
                  </div>
                </TableCell>
                <TableCell className="w-[110px] sm:w-[120px] lg:w-[130px]">
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="w-[100px] sm:w-[110px] lg:w-[120px]">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </TableCell>
                <TableCell className="w-[56px] sm:w-[64px]">
                  <div className="flex items-center justify-center">
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
