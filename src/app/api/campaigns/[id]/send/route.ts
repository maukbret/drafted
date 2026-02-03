import { createClient } from '@/lib/supabase/server'
import { getValidKlaviyoToken } from '@/lib/klaviyo'
import { NextRequest } from 'next/server'

// Helper to get timezone offset as a string (e.g., "+01:00" or "-05:00")
function getTimezoneOffsetString(timezone: string, date: Date): string {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = tzDate.getTime() - utcDate.getTime()
  const offsetMinutes = offsetMs / 60000
  const hours = Math.floor(Math.abs(offsetMinutes) / 60)
  const minutes = Math.abs(offsetMinutes) % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // Parse request body for asDraft option and settings
  const body = await request.json().catch(() => ({}))
  const asDraft = body.asDraft === true
  const settings = body.settings

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          send({ step: 'error', message: 'Unauthorized' })
          controller.close()
          return
        }

        // ============================================================
        // PHASE 1: Gather all data first to determine the steps needed
        // ============================================================

        // Get current campaign data
        const { data: existingCampaign } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .eq('user_id', user.id)
          .single()

        if (!existingCampaign) {
          send({ step: 'error', message: 'Campaign not found' })
          controller.close()
          return
        }

        // Get Klaviyo connection
        const { data: klaviyoConnection } = await supabase
          .from('klaviyo_connections')
          .select('id, klaviyo_account_id, access_token, refresh_token, expires_at')
          .eq('id', existingCampaign.klaviyo_connection_id)
          .single()

        if (!klaviyoConnection) {
          send({ step: 'error', message: 'Klaviyo connection not found' })
          controller.close()
          return
        }

        // Get project with frames
        const { data: project } = existingCampaign.project_id
          ? await supabase
            .from('projects')
            .select('*, frames(*)')
            .eq('id', existingCampaign.project_id)
            .single()
          : { data: null }

        if (!project || !project.frames?.length) {
          send({ step: 'error', message: 'No email content found' })
          controller.close()
          return
        }

        const frames = project.frames.sort((a: any, b: any) => a.display_order - b.display_order)

        // Determine operation type and what steps are needed
        const isUpdate = !!(existingCampaign.klaviyo_template_id && existingCampaign.klaviyo_campaign_id)
        const imagesNeedUpload = frames.some((f: any) => f.image_url && !f.klaviyo_image_url)

        // ============================================================
        // PHASE 2: Process each step (client shows all steps from start)
        // ============================================================

        // Step 1: Save settings
        send({ step: 'settings', status: 'in_progress' })

        // Extract timezone settings
        const useRecipientTimezone = settings?.useRecipientTimezone === true
        const timezone = settings?.timezone || 'Europe/Amsterdam'

        // Calculate scheduled_at from date and time if provided in settings
        let scheduled_at: string | null = null
        if (settings?.scheduledDate && settings?.scheduledTime) {
          if (useRecipientTimezone) {
            // For recipient timezone, store the datetime as-is (Klaviyo will interpret it per recipient)
            scheduled_at = `${settings.scheduledDate}T${settings.scheduledTime}:00`
          } else {
            // Include timezone offset so Klaviyo displays in the selected timezone
            // e.g., "2024-01-26T14:30:00+01:00" for Amsterdam
            const dateForOffset = new Date(`${settings.scheduledDate}T${settings.scheduledTime}:00Z`)
            const offset = getTimezoneOffsetString(timezone, dateForOffset)
            scheduled_at = `${settings.scheduledDate}T${settings.scheduledTime}:00${offset}`
          }
        }

        if (settings) {
          const { error: updateError } = await supabase
            .from('campaigns')
            .update({
              name: settings.name?.trim(),
              subject_line: settings.subjectLine?.trim(),
              preview_text: settings.previewText?.trim() || null,
              included_audiences: settings.includedAudiences,
              excluded_audiences: settings.excludedAudiences,
              scheduled_at,
              send_in_recipient_timezone: useRecipientTimezone,
              status: 'in_progress',
            })
            .eq('id', campaignId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Campaign settings update error:', updateError)
            send({ step: 'error', message: `Failed to save campaign settings: ${updateError.message}` })
            controller.close()
            return
          }
        }

        send({ step: 'settings', status: 'complete' })

        // Re-fetch campaign with updated settings
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .eq('user_id', user.id)
          .single()

        if (!campaign) {
          send({ step: 'error', message: 'Campaign not found after update' })
          controller.close()
          return
        }

        // Validate required fields
        if (!campaign.subject_line) {
          send({ step: 'error', message: 'Subject line is required' })
          controller.close()
          return
        }

        if (!campaign.included_audiences || campaign.included_audiences.length === 0) {
          send({ step: 'error', message: 'At least one audience is required' })
          controller.close()
          return
        }

        console.log('Using Klaviyo connection:', klaviyoConnection.id, 'Account:', klaviyoConnection.klaviyo_account_id)

        // Get valid Klaviyo token (refreshes automatically if needed)
        const klaviyoToken = await getValidKlaviyoToken(supabase, klaviyoConnection.id)

        if (!klaviyoToken) {
          send({ step: 'error', message: 'Klaviyo token expired. Please reconnect Klaviyo.' })
          controller.close()
          return
        }

        // Fetch Klaviyo account info for sender details
        let senderEmail = ''
        let senderName = ''
        try {
          const accountResponse = await fetch('https://a.klaviyo.com/api/accounts/', {
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Accept': 'application/json',
              'revision': '2024-10-15',
            },
          })
          if (accountResponse.ok) {
            const accountData = await accountResponse.json()
            const account = accountData.data?.[0]?.attributes
            senderEmail = account?.contact_information?.default_sender_email || ''
            senderName = account?.contact_information?.default_sender_name || account?.public_api_name || ''
            console.log('Klaviyo account sender:', senderName, senderEmail)
          }
        } catch (err) {
          console.error('Failed to fetch Klaviyo account info:', err)
        }

        if (!senderEmail) {
          send({ step: 'error', message: 'Could not get sender email from Klaviyo. Please configure your sender email in Klaviyo settings.' })
          controller.close()
          return
        }

        // Fetch stored footer HTML for this Klaviyo account (if useCustomFooter is enabled)
        const useCustomFooter = settings?.useCustomFooter !== false // Default to true if not specified
        let footerHtml = ''

        if (useCustomFooter && klaviyoConnection.klaviyo_account_id) {
          // First try to get user's own footer
          let { data: footer } = await supabase
            .from('klaviyo_footers')
            .select('footer_html')
            .eq('user_id', user.id)
            .eq('klaviyo_account_id', klaviyoConnection.klaviyo_account_id)
            .single()

          // If no own footer, check for team admin footer
          if (!footer) {
            const { data: teamMembership } = await supabase
              .from('team_members')
              .select('team_id')
              .eq('user_id', user.id)
              .single()

            if (teamMembership) {
              const { data: adminMembers } = await supabase
                .from('team_members')
                .select('user_id')
                .eq('team_id', teamMembership.team_id)
                .eq('role', 'admin')

              if (adminMembers && adminMembers.length > 0) {
                const { data: teamFooter } = await supabase
                  .from('klaviyo_footers')
                  .select('footer_html')
                  .eq('klaviyo_account_id', klaviyoConnection.klaviyo_account_id)
                  .in('user_id', adminMembers.map(m => m.user_id))
                  .single()

                footer = teamFooter
              }
            }
          }

          if (footer) {
            footerHtml = footer.footer_html
            console.log('Using stored footer, length:', footerHtml.length)
          }
        }

        if (!useCustomFooter) {
          // Use simple unsubscribe tag instead of custom footer (wrapped in a table)
          footerHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px;">
            <tr>
              <td align="center" valign="top" style="padding: 20px; font-family: Arial, sans-serif; font-size: 12px; color: #666666;">
                {% unsubscribe %} {{ organization.name }} {% current_year %} {{ organization.full_address }}
              </td>
            </tr>
          </table>`
          console.log('Using simple unsubscribe tag instead of custom footer')
        }

        // Step 2: Upload images to Klaviyo (skip if already uploaded)
        if (imagesNeedUpload) {
          send({ step: 'images', status: 'in_progress' })
        } else {
          send({ step: 'images', status: 'skip' })
        }

        // Upload images in parallel using Promise.all for faster processing
        const uploadedFrames = await Promise.all(
          frames.map(async (frame: any) => {
            if (!frame.image_url) return frame
            // Skip upload if image was already uploaded to Klaviyo
            if (frame.klaviyo_image_url) {
              console.log('Skipping image upload, already exists:', frame.name)
              return frame
            }

            try {
              const imageResponse = await fetch('https://a.klaviyo.com/api/images', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${klaviyoToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'revision': '2024-06-15',
                },
                body: JSON.stringify({
                  data: {
                    type: 'image',
                    attributes: {
                      name: frame.name,
                      import_from_url: frame.image_url,
                      hidden: false,
                    },
                  },
                }),
              })

              if (imageResponse.ok) {
                const imageData = await imageResponse.json()
                const klaviyoImageUrl = imageData.data?.attributes?.image_url || frame.image_url

                // Update database (non-blocking, don't await)
                supabase
                  .from('frames')
                  .update({ klaviyo_image_url: klaviyoImageUrl })
                  .eq('id', frame.id)
                  .then(
                    () => console.log('Updated frame:', frame.name),
                    (err) => console.error('Frame update error:', err)
                  )
                return { ...frame, klaviyo_image_url: klaviyoImageUrl }
              } else {
                console.error('Image upload failed:', frame.name)
                return { ...frame, klaviyo_image_url: frame.image_url }
              }
            } catch (err) {
              console.error('Image upload error:', err)
              return { ...frame, klaviyo_image_url: frame.image_url }
            }
          })
        )

        if (imagesNeedUpload) {
          send({ step: 'images', status: 'complete' })
        }

        // Step 3: Create or update template in Klaviyo
        send({ step: 'template', status: 'in_progress', label: isUpdate ? 'Updating template' : 'Creating template' })

        const html = generateEmailHtml(uploadedFrames, footerHtml)

        let templateId = campaign.klaviyo_template_id
        let klaviyoCampaignId = campaign.klaviyo_campaign_id

        const templateName = `${campaign.name} - Template`

        if (templateId) {
          // Update existing template
          console.log('Updating existing template:', templateId)
          const templateResponse = await fetch(`https://a.klaviyo.com/api/templates/${templateId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'revision': '2024-06-15',
            },
            body: JSON.stringify({
              data: {
                type: 'template',
                id: templateId,
                attributes: {
                  name: templateName,
                  html: html,
                },
              },
            }),
          })

          if (!templateResponse.ok) {
            const errorText = await templateResponse.text()
            console.error('Klaviyo template update error:', errorText)
            // If update fails, try creating a new one
            templateId = null
          }
        }

        if (!templateId) {
          // Create new template
          console.log('Creating new template')
          const templateResponse = await fetch('https://a.klaviyo.com/api/templates', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'revision': '2024-06-15',
            },
            body: JSON.stringify({
              data: {
                type: 'template',
                attributes: {
                  name: templateName,
                  editor_type: 'CODE',
                  html: html,
                },
              },
            }),
          })

          if (!templateResponse.ok) {
            const errorText = await templateResponse.text()
            console.error('Klaviyo template creation error:', errorText)
            send({ step: 'error', message: 'Failed to create email template' })
            controller.close()
            return
          }

          const templateData = await templateResponse.json()
          templateId = templateData.data?.id
        }

        send({ step: 'template', status: 'complete' })

        // Step 4: Create or update campaign in Klaviyo
        send({ step: 'campaign', status: 'in_progress', label: isUpdate ? 'Updating campaign' : 'Creating campaign' })

        let messageId: string | null = null

        if (klaviyoCampaignId) {
          // Update existing campaign - first get the message ID
          console.log('Updating existing campaign:', klaviyoCampaignId)

          const getCampaignResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${klaviyoCampaignId}?include=campaign-messages`, {
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Accept': 'application/json',
              'revision': '2024-06-15',
            },
          })

          if (getCampaignResponse.ok) {
            const existingCampaignData = await getCampaignResponse.json()
            messageId = existingCampaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id

            // Update campaign name and audiences
            const updateCampaignResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${klaviyoCampaignId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${klaviyoToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'revision': '2024-06-15',
              },
              body: JSON.stringify({
                data: {
                  type: 'campaign',
                  id: klaviyoCampaignId,
                  attributes: {
                    name: campaign.name,
                    audiences: {
                      included: campaign.included_audiences.map((a: any) => a.id),
                      excluded: campaign.excluded_audiences?.map((a: any) => a.id) || [],
                    },
                    send_strategy: campaign.scheduled_at ? {
                      method: 'static',
                      options_static: {
                        datetime: campaign.scheduled_at,
                        is_local: campaign.send_in_recipient_timezone || false,
                        ...(campaign.send_in_recipient_timezone ? { send_past_recipients_immediately: true } : {}),
                      },
                    } : undefined,
                  },
                },
              }),
            })

            if (!updateCampaignResponse.ok) {
              const errorText = await updateCampaignResponse.text()
              console.error('Klaviyo campaign update error:', errorText)
              // If update fails, create a new campaign
              klaviyoCampaignId = null
              messageId = null
            }

            // Update campaign message (subject, preview text)
            if (messageId) {
              const updateMessageResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${messageId}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${klaviyoToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'revision': '2024-06-15',
                },
                body: JSON.stringify({
                  data: {
                    type: 'campaign-message',
                    id: messageId,
                    attributes: {
                      content: {
                        subject: campaign.subject_line,
                        preview_text: campaign.preview_text || '',
                        from_email: senderEmail,
                        from_label: senderName,
                      },
                    },
                  },
                }),
              })

              if (!updateMessageResponse.ok) {
                const errorText = await updateMessageResponse.text()
                console.error('Klaviyo message update error:', errorText)
              }
            }
          } else {
            // Campaign not found, create new one
            klaviyoCampaignId = null
          }
        }

        if (!klaviyoCampaignId) {
          // Create new campaign
          console.log('Creating new campaign')
          console.log('Included audiences:', JSON.stringify(campaign.included_audiences))
          console.log('Excluded audiences:', JSON.stringify(campaign.excluded_audiences))
          const campaignAttributes: any = {
            name: campaign.name,
            audiences: {
              included: campaign.included_audiences.map((a: any) => a.id),
              excluded: campaign.excluded_audiences?.map((a: any) => a.id) || [],
            },
            'campaign-messages': {
              data: [
                {
                  type: 'campaign-message',
                  attributes: {
                    channel: 'email',
                    label: 'Email Message',
                    content: {
                      subject: campaign.subject_line,
                      preview_text: campaign.preview_text || '',
                      from_email: senderEmail,
                      from_label: senderName,
                    },
                    render_options: {
                      shorten_links: true,
                      add_org_prefix: true,
                      add_info_link: true,
                    },
                  },
                },
              ],
            },
            send_options: {
              use_smart_sending: false,
            },
          }

          if (campaign.scheduled_at) {
            campaignAttributes.send_strategy = {
              method: 'static',
              options_static: {
                datetime: campaign.scheduled_at,
                is_local: campaign.send_in_recipient_timezone || false,
                ...(campaign.send_in_recipient_timezone ? { send_past_recipients_immediately: true } : {}),
              },
            }
          }

          const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'revision': '2024-06-15',
            },
            body: JSON.stringify({
              data: {
                type: 'campaign',
                attributes: campaignAttributes,
              },
            }),
          })

          if (!campaignResponse.ok) {
            const errorText = await campaignResponse.text()
            console.error('Klaviyo campaign creation error:', errorText)
            send({ step: 'error', message: 'Failed to create campaign in Klaviyo' })
            controller.close()
            return
          }

          const campaignData = await campaignResponse.json()
          klaviyoCampaignId = campaignData.data?.id
          messageId = campaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id
        }

        console.log('Campaign ID:', klaviyoCampaignId)
        console.log('Message ID:', messageId)

        if (!messageId) {
          console.error('No message ID found')
          send({ step: 'error', message: 'No message found in campaign' })
          controller.close()
          return
        }

        // Assign the template to the message
        const assignTemplateResponse = await fetch('https://a.klaviyo.com/api/campaign-message-assign-template', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${klaviyoToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'revision': '2024-06-15',
          },
          body: JSON.stringify({
            data: {
              type: 'campaign-message',
              id: messageId,
              relationships: {
                template: {
                  data: {
                    type: 'template',
                    id: templateId,
                  },
                },
              },
            },
          }),
        })

        if (!assignTemplateResponse.ok) {
          const errorText = await assignTemplateResponse.text()
          console.error('Klaviyo assign template error:', errorText)
          send({ step: 'error', message: 'Failed to assign template to campaign' })
          controller.close()
          return
        }

        console.log('Template assigned successfully')

        send({ step: 'campaign', status: 'complete' })

        // Step 5: Finalize (schedule or save as draft)
        const finalStepLabel = asDraft ? 'Saving as draft' : 'Scheduling campaign'
        send({ step: 'finalizing', status: 'in_progress', label: finalStepLabel })

        let finalStatus: string

        if (asDraft) {
          // Skip sending - leave campaign as draft in Klaviyo
          console.log('Saving as draft in Klaviyo (not triggering send)')
          finalStatus = 'klaviyo_draft'
        } else {
          // Trigger the send job (will send immediately or use the send_strategy schedule)
          const sendResponse = await fetch('https://a.klaviyo.com/api/campaign-send-jobs', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'revision': '2024-06-15',
            },
            body: JSON.stringify({
              data: {
                type: 'campaign-send-job',
                id: klaviyoCampaignId,
              },
            }),
          })

          if (!sendResponse.ok) {
            const errorText = await sendResponse.text()
            console.error('Klaviyo send error:', errorText)
            send({ step: 'error', message: 'Failed to send campaign' })
            controller.close()
            return
          }

          // Set status based on whether it was scheduled or sent immediately
          finalStatus = campaign.scheduled_at ? 'scheduled' : 'sent'
        }

        // Update campaign in database
        await supabase
          .from('campaigns')
          .update({
            status: finalStatus,
            klaviyo_campaign_id: klaviyoCampaignId,
            klaviyo_template_id: templateId,
          })
          .eq('id', campaignId)

        // Update project status
        if (campaign.project_id) {
          await supabase
            .from('projects')
            .update({ status: 'exported' })
            .eq('id', campaign.project_id)
        }

        send({ step: 'finalizing', status: 'complete' })

        // Send completion signal
        send({ step: 'done', klaviyoCampaignId, status: finalStatus })

      } catch (err) {
        console.error('Send campaign error:', err)
        send({ step: 'error', message: err instanceof Error ? err.message : 'Internal server error' })
      }

      controller.close()
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

// Half-width threshold: 50% of 600px email width
const HALF_WIDTH_THRESHOLD = 300

// Clean up common HTML issues in footer that can break email rendering
// Klaviyo footers often use "Ghost Table" patterns with MSO conditionals that create
// invalid HTML nesting (e.g., <div> directly inside <tr>)
function cleanFooterHtml(html: string): string {
  if (!html) return ''

  let cleaned = html

  // Fix double </table> tags in MSO conditionals (common copy-paste error)
  cleaned = cleaned.replace(/<!--\[if mso\]><\/table><\/table><!\[endif\]-->/gi, '<!--[if mso]></table><![endif]-->')
  cleaned = cleaned.replace(/(<!--\[if mso\]>)(<\/table>)\2+(<!\[endif\]-->)/gi, '$1$2$3')

  // Remove Ghost Table MSO conditionals that create invalid nesting
  // These patterns put <div> elements directly inside <tr>, which is invalid HTML
  // Pattern: <!--[if mso]><table...><tr><![endif]--> followed by <div class="kl-row">
  // We remove the ghost table entirely and let the responsive divs handle layout

  // Remove opening ghost table patterns (table + tr openers before divs)
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<table[^>]*>\s*<tr>\s*<!\[endif\]-->/gi, '')

  // Remove ghost td openers that appear after kl-row divs
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<td[^>]*>\s*<!\[endif\]-->/gi, '')

  // Remove ghost td closers
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<\/td>\s*<!\[endif\]-->/gi, '')

  // Remove closing ghost table patterns (tr + table closers)
  cleaned = cleaned.replace(/<!--\[if mso\]>\s*<\/tr>\s*<\/table>\s*<!\[endif\]-->/gi, '')

  // Clean up any resulting double whitespace/newlines
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n')

  return cleaned
}

function generateEmailHtml(frames: Array<{
  name: string
  width: number | null
  klaviyo_image_url: string | null
  link_url: string | null
}>, footerHtml: string = ''): string {
  // Group frames for side-by-side layout
  const rows: string[] = []
  let i = 0

  while (i < frames.length) {
    const current = frames[i]
    const next = frames[i + 1]

    const currentIsHalf = (current.width ?? 600) <= HALF_WIDTH_THRESHOLD
    const nextIsHalf = next && (next.width ?? 600) <= HALF_WIDTH_THRESHOLD

    if (currentIsHalf && nextIsHalf) {
      // Two-column row using nested table for reliable rendering
      const leftImg = `<img src="${current.klaviyo_image_url}" alt="${current.name}" width="300" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`
      const rightImg = `<img src="${next.klaviyo_image_url}" alt="${next.name}" width="300" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`

      const leftContent = current.link_url
        ? `<a href="${current.link_url}" target="_blank" style="display: block; text-decoration: none;">${leftImg}</a>`
        : leftImg
      const rightContent = next.link_url
        ? `<a href="${next.link_url}" target="_blank" style="display: block; text-decoration: none;">${rightImg}</a>`
        : rightImg

      rows.push(`      <tr>
        <td align="center" valign="top" style="padding: 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="width: 100%; max-width: 600px;">
            <tr>
              <td width="300" valign="top" style="width: 50%;">
                ${leftContent}
              </td>
              <td width="300" valign="top" style="width: 50%;">
                ${rightContent}
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
      i += 2
    } else {
      // Single full-width frame
      const imgTag = `<img src="${current.klaviyo_image_url}" alt="${current.name}" width="600" style="display: block; width: 100%; height: auto; border: 0; outline: none; text-decoration: none;" />`

      const content = current.link_url
        ? `<a href="${current.link_url}" target="_blank" style="display: block; text-decoration: none;">${imgTag}</a>`
        : imgTag

      rows.push(`      <tr>
        <td align="center" valign="top" style="padding: 0;">
          ${content}
        </td>
      </tr>`)
      i += 1
    }
  }

  const frameRows = rows.join('\n')

  // Clean up footer HTML and use directly (footer is already a table from selection)
  const cleanedFooter = cleanFooterHtml(footerHtml)

  // Footer goes directly below content table (no extra wrapping needed)
  const footerSection = cleanedFooter ? `
        <!-- Footer -->
${cleanedFooter}` : ''

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>Email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    /* Responsive styles */
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-container img { width: 100% !important; height: auto !important; }
      .email-container table[width="600"] { width: 100% !important; }
      .email-container td[width="300"] { width: 50% !important; display: inline-block !important; }
    }
    /* iOS blue link fix */
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    /* Gmail blue link fix */
    u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
    /* Samsung Mail blue link fix */
    #MessageViewBody a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
  </style>
</head>
<body id="body" style="margin: 0 !important; padding: 0 !important; background-color: #f4f4f4;">
  <!-- Wrapper table for centering -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" valign="top" style="padding: 0;">
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center">
        <tr>
        <td>
        <![endif]-->
        <!-- Email content table (images/sections from Figma) -->
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff;">
${frameRows}
        </table>
${footerSection}
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`
}
