import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown } from 'lucide-react'

export function CampaignListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="bg-muted/40 border-y border-border/60 first:border-l first:rounded-tl-lg last:border-r last:rounded-tr-lg">
            <span className="-mx-2 block px-4">Campaign</span>
          </TableHead>
          <TableHead className="bg-muted/40 border-y border-border/60">
            <span>Status</span>
          </TableHead>
          <TableHead className="bg-muted/40 border-y border-border/60">
            <span>Account</span>
          </TableHead>
          <TableHead className="bg-muted/40 border-y border-border/60">
            <span>Created by</span>
          </TableHead>
          <TableHead className="bg-muted/40 border-y border-border/60">
            <Button variant="ghost" className="-ml-4" disabled>
              Created
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead className="bg-muted/40 border-y border-border/60">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {Array.from({ length: rows }).map((_, index) => (
          <TableRow key={index} className="h-[52px]">
            <TableCell>
              <Skeleton className="h-4 w-[60%]" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-7 w-7 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3 w-20" />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end">
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
