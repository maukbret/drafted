'use client'

import { AlertCircle } from 'lucide-react'
import { CampaignEmailPreview, CampaignPreviewFrame } from './campaign-email-preview'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface CampaignPreviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjectLine: string
  previewText: string
  frames: CampaignPreviewFrame[]
  useCustomFooter: boolean
  footerHtml: string | null
  footerLoading: boolean
  footerError: string | null
}

export function CampaignPreviewSheet({
  open,
  onOpenChange,
  subjectLine,
  previewText,
  frames,
  useCustomFooter,
  footerHtml,
  footerLoading,
  footerError,
}: CampaignPreviewSheetProps) {
  const trimmedSubject = subjectLine.trim()
  const trimmedPreviewText = previewText.trim()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[min(92vw,min(42rem,max(20rem,30vw)))]"
      >
        <div className="h-full overflow-hidden flex flex-col">
          <SheetHeader className="pr-8">
            <SheetTitle>Preview email</SheetTitle>
            <SheetDescription>
              Check subject, preview text, and content before sending. Hover a
              section in the email to see its link URL.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Subject line
              </p>
              <p className="text-sm">
                {trimmedSubject || 'No subject line yet'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Preview text
              </p>
              {trimmedPreviewText ? (
                <p className="text-sm">{trimmedPreviewText}</p>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p>
                      This is empty. Preview text appears in most inboxes next to your subject line, so you may want to fill it in.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 flex-1 min-h-0 flex flex-col">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email
              </p>
              {useCustomFooter && (
                <p className="text-xs text-muted-foreground">
                  {footerLoading
                    ? 'Loading saved footer...'
                    : footerError
                      ? 'Footer could not be loaded. This preview currently shows the email body only.'
                      : footerHtml
                        ? 'Saved footer included below.'
                        : 'No saved footer found for this connection.'}
                </p>
              )}
              <div className="flex-1 min-h-0 rounded-md border overflow-y-auto bg-muted/50 p-3">
                <CampaignEmailPreview
                  frames={frames}
                  footerHtml={useCustomFooter && !footerLoading && !footerError ? footerHtml : null}
                  showSectionLinkTooltips
                />
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
