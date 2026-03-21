export interface ExportSettings {
  name: string
  subjectLine: string
  previewText: string | null
  includedAudiences: { id: string; name: string }[]
  excludedAudiences: { id: string; name: string }[]
  scheduledDate: string
  scheduledTime: string
  timezone: string
  useRecipientTimezone: boolean
  useCustomFooter: boolean
  utmEnabled: boolean
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string
  utmTerm: string
}
