import { PageHeader } from '@/components/page-header'
import { ContentSpinner } from '@/components/content-spinner'

export default function ImagesLoading() {
  return (
    <div className="p-8">
      <PageHeader
        title="Upload images"
        subtitle="Upload images from Figma to Klaviyo for use in drag & drop templates or dynamic content blocks."
      />
      <ContentSpinner />
    </div>
  )
}
