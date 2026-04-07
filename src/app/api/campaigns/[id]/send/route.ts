import { createClient } from '@/lib/supabase/server'
import { ensureKlaviyoAccountId, getValidKlaviyoToken } from '@/lib/klaviyo'
import { formatKlaviyoImageApiErrorBody, importProjectFramesToKlaviyo } from '@/lib/klaviyo-import-frame-images'
import { generateCampaignEmailHtml } from '@/lib/email/campaign-email-html'
import { emailHtmlContainsSupabaseFrameImageUrls } from '@/lib/frame-url'
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

function formatKlaviyoErrorMessage(errorBody: string): string {
  try {
    const parsed = JSON.parse(errorBody) as { errors?: Array<{ detail?: string; title?: string }> }
    const first = parsed.errors?.[0]
    if (first?.detail) return first.detail
    if (first?.title) return first.title
  } catch {
    /* ignore */
  }
  return errorBody.length > 400 ? `${errorBody.slice(0, 400)}…` : errorBody
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

      let revertStatusAfterFailedExport: (() => Promise<void>) | null = null

      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          send({ step: 'error', message: 'Unauthorized' })
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
          return
        }

        const hadSettingsUpdate = !!settings

        revertStatusAfterFailedExport = async () => {
          if (!hadSettingsUpdate) return
          const { error } = await supabase
            .from('campaigns')
            .update({ status: existingCampaign.status })
            .eq('id', campaignId)
            .eq('user_id', user.id)
          if (error) {
            console.error('Failed to revert campaign status after export error:', error)
          }
        }

        const endExportWithError = async (
          message: string,
          meta?: { hint?: 'klaviyo_hosting' }
        ) => {
          await revertStatusAfterFailedExport?.()
          send({
            step: 'error',
            message,
            ...(meta?.hint ? { hint: meta.hint } : {}),
          })
        }

        // Get Klaviyo connection
        const { data: klaviyoConnection } = await supabase
          .from('klaviyo_connections')
          .select('id, user_id, klaviyo_account_id, access_token, refresh_token, expires_at')
          .eq('id', existingCampaign.klaviyo_connection_id)
          .single()

        if (!klaviyoConnection) {
          send({ step: 'error', message: 'Klaviyo connection not found' })
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
          return
        }

        const frames = project.frames.sort((a: any, b: any) => a.display_order - b.display_order)

        // Determine operation type and what steps are needed
        const isUpdate = !!(existingCampaign.klaviyo_template_id && existingCampaign.klaviyo_campaign_id)
        /** True when any slice still has Storage — we will re-import to Klaviyo so progress UI is accurate */
        const imagesNeedProcessing = frames.some((f: any) => normalizeImageUrl(f.image_url))

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
          const utmSettings = settings.utmEnabled ? {
            enabled: true,
            source: settings.utmSource || '',
            medium: settings.utmMedium || '',
            campaign: settings.utmCampaign || '',
            content: settings.utmContent || '',
            term: settings.utmTerm || '',
          } : null

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
              utm_settings: utmSettings,
              status: 'in_progress',
            })
            .eq('id', campaignId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Campaign settings update error:', updateError)
            await endExportWithError(`Failed to save campaign settings: ${updateError.message}`)
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
          await endExportWithError('Campaign not found after update')
          return
        }

        // Validate required fields
        if (!campaign.subject_line) {
          await endExportWithError('Subject line is required')
          return
        }

        if (!campaign.included_audiences || campaign.included_audiences.length === 0) {
          await endExportWithError('At least one audience is required')
          return
        }

        // Get valid Klaviyo token (refreshes automatically if needed)
        const klaviyoToken = await getValidKlaviyoToken(supabase, klaviyoConnection.id)

        if (!klaviyoToken) {
          await endExportWithError('Klaviyo token expired. Please reconnect Klaviyo.')
          return
        }

        const klaviyoAccountId = klaviyoConnection.klaviyo_account_id
          || await ensureKlaviyoAccountId(supabase, klaviyoConnection.id, { accessToken: klaviyoToken })
          || existingCampaign.klaviyo_account_id
          || null

        console.log('Using Klaviyo connection:', klaviyoConnection.id, 'Account:', klaviyoAccountId)

        if (!klaviyoAccountId) {
          await endExportWithError('This Klaviyo connection does not have an account ID. Please reconnect your Klaviyo account.')
          return
        }

        // Fetch Klaviyo account info for sender details
        let senderEmail = ''
        let senderName = ''
        try {
          const accountResponse = await fetch(`https://a.klaviyo.com/api/accounts/${encodeURIComponent(klaviyoAccountId)}`, {
            headers: {
              'Authorization': `Bearer ${klaviyoToken}`,
              'Accept': 'application/json',
              'revision': '2026-01-15',
            },
          })
          if (accountResponse.ok) {
            const accountData = await accountResponse.json()
            const account = accountData.data?.attributes
            senderEmail = account?.contact_information?.default_sender_email || ''
            senderName = account?.contact_information?.default_sender_name || account?.public_api_name || ''
            console.log('Klaviyo account sender:', senderName, senderEmail)
          } else {
            const errorText = await accountResponse.text()
            console.error('Failed to fetch Klaviyo account info:', accountResponse.status, errorText)
          }
        } catch (err) {
          console.error('Failed to fetch Klaviyo account info:', err)
        }

        if (!senderEmail) {
          await endExportWithError('Could not get sender email from Klaviyo. Please configure your sender email in Klaviyo settings.')
          return
        }

        // Fetch stored footer HTML for this Klaviyo account (if useCustomFooter is enabled)
        const useCustomFooter = settings?.useCustomFooter !== false // Default to true if not specified
        let footerHtml = ''
        let footerCss = ''

        if (useCustomFooter && klaviyoAccountId) {
          const connectionOwnerId = klaviyoConnection.user_id

          let { data: footer } = await supabase
            .from('klaviyo_footers')
            .select('footer_html, footer_css')
            .eq('user_id', connectionOwnerId)
            .eq('klaviyo_account_id', klaviyoAccountId)
            .maybeSingle()

          if (!footer && connectionOwnerId !== user.id) {
            const { data: ownFooter } = await supabase
              .from('klaviyo_footers')
              .select('footer_html, footer_css')
              .eq('user_id', user.id)
              .eq('klaviyo_account_id', klaviyoAccountId)
              .maybeSingle()
            footer = ownFooter
          }

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
                  .select('footer_html, footer_css')
                  .eq('klaviyo_account_id', klaviyoAccountId)
                  .in('user_id', adminMembers.map(m => m.user_id))
                  .maybeSingle()

                footer = teamFooter
              }
            }
          }

          if (footer) {
            footerHtml = footer.footer_html
            footerCss = footer.footer_css || ''
            console.log('Using stored footer, length:', footerHtml.length, 'css length:', footerCss.length)
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

        // Step 2: Import every Storage image into Klaviyo (fail export if any import fails — no Supabase URLs in HTML)
        if (imagesNeedProcessing) {
          send({ step: 'images', status: 'in_progress' })
        } else {
          send({ step: 'images', status: 'skip' })
        }

        const importResult = await importProjectFramesToKlaviyo(
          supabase,
          frames,
          klaviyoToken,
          formatKlaviyoImageApiErrorBody
        )
        if (!importResult.ok) {
          await endExportWithError(importResult.message, { hint: 'klaviyo_hosting' })
          return
        }
        const uploadedFrames = importResult.frames

        if (imagesNeedProcessing) {
          send({ step: 'images', status: 'complete' })
        }

        // Step 3: Create or update template in Klaviyo
        send({ step: 'template', status: 'in_progress', label: isUpdate ? 'Updating template' : 'Creating template' })

        const useHybridSlot = Boolean(campaign.klaviyo_hybrid_dnd_slot)
        const templateEditorType = useHybridSlot ? 'USER_DRAGGABLE' : 'CODE'
        const html = generateCampaignEmailHtml(
          uploadedFrames,
          footerHtml,
          campaign.preview_text || '',
          footerCss,
          { includeKlaviyoHybridSlot: useHybridSlot },
        )

        if (emailHtmlContainsSupabaseFrameImageUrls(html)) {
          await endExportWithError(
            'Email HTML still references Drafted storage for at least one image (body or footer). Every image must be hosted by Klaviyo before we update your template—fix the footer in Klaviyo if it embeds storage links, or go back to the slice step and re-save sections, then export again.',
            { hint: 'klaviyo_hosting' }
          )
          return
        }

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
              'revision': '2026-01-15',
            },
            body: JSON.stringify({
              data: {
                type: 'template',
                id: templateId,
                attributes: {
                  name: templateName,
                  editor_type: templateEditorType,
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
              'revision': '2026-01-15',
            },
            body: JSON.stringify({
              data: {
                type: 'template',
                attributes: {
                  name: templateName,
                  editor_type: templateEditorType,
                  html: html,
                },
              },
            }),
          })

          if (!templateResponse.ok) {
            const errorText = await templateResponse.text()
            console.error('Klaviyo template creation error:', errorText)
            await endExportWithError('Failed to create email template')
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
              'revision': '2026-01-15',
            },
          })

          if (getCampaignResponse.ok) {
            const existingCampaignData = await getCampaignResponse.json()
            messageId = existingCampaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id

            // Update campaign name, audiences, and tracking options
            const updateCampaignResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${klaviyoCampaignId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${klaviyoToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'revision': '2026-01-15',
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
                      datetime: campaign.scheduled_at,
                      options: {
                        is_local: campaign.send_in_recipient_timezone || false,
                        ...(campaign.send_in_recipient_timezone ? { send_past_recipients_immediately: true } : {}),
                      },
                    } : undefined,
                    tracking_options: {
                      is_tracking_clicks: true,
                      is_tracking_opens: true,
                      add_tracking_params: !!campaign.utm_settings?.enabled,
                      custom_tracking_params: campaign.utm_settings?.enabled
                        ? [
                            { type: 'static', name: 'utm_source', value: campaign.utm_settings.source },
                            { type: 'static', name: 'utm_medium', value: campaign.utm_settings.medium },
                            { type: 'static', name: 'utm_campaign', value: campaign.utm_settings.campaign },
                            { type: 'static', name: 'utm_content', value: campaign.utm_settings.content },
                            { type: 'static', name: 'utm_term', value: campaign.utm_settings.term },
                          ].filter((p: { type: string; name: string; value: string }) => p.value)
                        : [],
                    },
                  },
                },
              }),
            })

            if (!updateCampaignResponse.ok) {
              const errorText = await updateCampaignResponse.text()
              console.error('Klaviyo campaign update error:', errorText)
              const detail = formatKlaviyoErrorMessage(errorText)
              await endExportWithError(
                `Klaviyo could not update the linked campaign (no new campaign was created). ${detail} If you already scheduled or sent this email from Klaviyo, continue there instead of exporting again from Mauk.ai.`,
              )
              return
            }

            // Update campaign message (subject, preview text)
            if (messageId) {
              const updateMessageResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${messageId}`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${klaviyoToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'revision': '2026-01-15',
                },
                body: JSON.stringify({
                  data: {
                    type: 'campaign-message',
                    id: messageId,
                    attributes: {
                      definition: {
                        content: {
                          subject: campaign.subject_line,
                          preview_text: campaign.preview_text || '',
                          from_email: senderEmail,
                          from_label: senderName,
                        },
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
          } else if (getCampaignResponse.status === 404) {
            klaviyoCampaignId = null
            messageId = null
          } else {
            const errorText = await getCampaignResponse.text()
            console.error('Klaviyo campaign fetch error:', getCampaignResponse.status, errorText)
            await endExportWithError(
              `Could not load the linked Klaviyo campaign: ${formatKlaviyoErrorMessage(errorText)}`,
            )
            return
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
                    definition: {
                      channel: 'email',
                      label: 'Email Message',
                      content: {
                        subject: campaign.subject_line,
                        preview_text: campaign.preview_text || '',
                        from_email: senderEmail,
                        from_label: senderName,
                      },
                    },
                  },
                },
              ],
            },
            send_options: {
              use_smart_sending: false,
            },
            tracking_options: {
              is_tracking_clicks: true,
              is_tracking_opens: true,
              add_tracking_params: !!campaign.utm_settings?.enabled,
              custom_tracking_params: campaign.utm_settings?.enabled
                ? [
                    { type: 'static', name: 'utm_source', value: campaign.utm_settings.source },
                    { type: 'static', name: 'utm_medium', value: campaign.utm_settings.medium },
                    { type: 'static', name: 'utm_campaign', value: campaign.utm_settings.campaign },
                    { type: 'static', name: 'utm_content', value: campaign.utm_settings.content },
                    { type: 'static', name: 'utm_term', value: campaign.utm_settings.term },
                  ].filter((p: { name: string; value: string }) => p.value)
                : [],
            },
          }

          if (campaign.scheduled_at) {
            campaignAttributes.send_strategy = {
              method: 'static',
              datetime: campaign.scheduled_at,
              options: {
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
              'revision': '2026-01-15',
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
            await endExportWithError('Failed to create campaign in Klaviyo')
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
          await endExportWithError('No message found in campaign')
          return
        }

        // Assign the template to the message
        const assignTemplateResponse = await fetch('https://a.klaviyo.com/api/campaign-message-assign-template', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${klaviyoToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'revision': '2026-01-15',
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
          await endExportWithError('Failed to assign template to campaign')
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
              'revision': '2026-01-15',
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
            await endExportWithError('Failed to send campaign')
            return
          }

          // Set status based on whether it was scheduled or sent immediately
          finalStatus = campaign.scheduled_at ? 'scheduled' : 'sent'
        }

        const previousPushCount =
          typeof campaign?.klaviyo_push_count === 'number' ? campaign.klaviyo_push_count : 0

        // Update campaign in database
        await supabase
          .from('campaigns')
          .update({
            status: finalStatus,
            klaviyo_campaign_id: klaviyoCampaignId,
            klaviyo_template_id: templateId,
            last_status_synced_at: new Date().toISOString(),
            klaviyo_push_count: previousPushCount + 1,
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
        await revertStatusAfterFailedExport?.()
        send({ step: 'error', message: err instanceof Error ? err.message : 'Internal server error' })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const normalized = url.trim()
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null
  return normalized
}
