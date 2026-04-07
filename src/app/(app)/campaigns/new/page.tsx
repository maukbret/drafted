import { redirect } from 'next/navigation'

/** Campaigns are created from the list page with a Figma URL (quick start). */
export default async function NewCampaignPage() {
  redirect('/campaigns')
}
