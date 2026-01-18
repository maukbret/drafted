import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get campaign with all related data
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, klaviyo_connections(access_token), projects(*, frames(*))')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!campaign.klaviyo_connections) {
      return NextResponse.json({ error: 'Klaviyo connection not found' }, { status: 400 })
    }

    if (!campaign.projects || !campaign.projects.frames?.length) {
      return NextResponse.json({ error: 'No email content found' }, { status: 400 })
    }

    if (!campaign.subject_line) {
      return NextResponse.json({ error: 'Subject line is required' }, { status: 400 })
    }

    if (!campaign.included_audiences || campaign.included_audiences.length === 0) {
      return NextResponse.json({ error: 'At least one audience is required' }, { status: 400 })
    }

    const klaviyoToken = (campaign.klaviyo_connections as any).access_token
    const frames = campaign.projects.frames.sort((a: any, b: any) => a.display_order - b.display_order)

    // Step 1: Upload images to Klaviyo
    const uploadedFrames = []
    for (const frame of frames) {
      if (!frame.image_url) continue

      try {
        const imageResponse = await fetch('https://a.klaviyo.com/api/images', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${klaviyoToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'revision': '2024-10-15',
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

          uploadedFrames.push({
            ...frame,
            klaviyo_image_url: klaviyoImageUrl,
          })

          await supabase
            .from('frames')
            .update({ klaviyo_image_url: klaviyoImageUrl })
            .eq('id', frame.id)
        } else {
          uploadedFrames.push({
            ...frame,
            klaviyo_image_url: frame.image_url,
          })
        }
      } catch (err) {
        console.error('Image upload error:', err)
        uploadedFrames.push({
          ...frame,
          klaviyo_image_url: frame.image_url,
        })
      }
    }

    // Step 2: Generate HTML email
    const html = generateEmailHtml(uploadedFrames)

    // Step 3: Create template in Klaviyo
    const templateName = `${campaign.name} - Template`
    const templateResponse = await fetch('https://a.klaviyo.com/api/templates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${klaviyoToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'revision': '2024-10-15',
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
      return NextResponse.json({ error: 'Failed to create email template' }, { status: 500 })
    }

    const templateData = await templateResponse.json()
    const templateId = templateData.data?.id

    // Step 4: Create campaign in Klaviyo
    const campaignPayload: any = {
      data: {
        type: 'campaign',
        attributes: {
          name: campaign.name,
          audiences: {
            included: campaign.included_audiences.map((a: any) => a.id),
            excluded: campaign.excluded_audiences?.map((a: any) => a.id) || [],
          },
          send_options: {
            use_smart_sending: true,
          },
          campaign_messages: {
            data: [
              {
                type: 'campaign-message',
                attributes: {
                  channel: 'email',
                  label: 'Email Message',
                  content: {
                    subject: campaign.subject_line,
                    preview_text: campaign.preview_text || '',
                    from_email: '{{ organization.email }}',
                    from_label: '{{ organization.name }}',
                  },
                  render_options: {
                    shorten_links: true,
                    add_org_prefix: true,
                    add_info_link: true,
                    add_opt_out_link: true,
                  },
                },
                relationships: {
                  template: {
                    data: {
                      type: 'template',
                      id: templateId,
                    },
                  },
                },
              },
            ],
          },
        },
      },
    }

    const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${klaviyoToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'revision': '2024-10-15',
      },
      body: JSON.stringify(campaignPayload),
    })

    if (!campaignResponse.ok) {
      const errorText = await campaignResponse.text()
      console.error('Klaviyo campaign creation error:', errorText)
      return NextResponse.json({ error: 'Failed to create campaign in Klaviyo' }, { status: 500 })
    }

    const campaignData = await campaignResponse.json()
    const klaviyoCampaignId = campaignData.data?.id

    // Step 5: Send or schedule the campaign
    let finalStatus: 'scheduled' | 'sent' = 'sent'

    if (campaign.scheduled_at) {
      // Schedule for later
      const scheduleResponse = await fetch(`https://a.klaviyo.com/api/campaign-send-jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${klaviyoToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'revision': '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'campaign-send-job',
            attributes: {
              scheduled_at: campaign.scheduled_at,
            },
            relationships: {
              campaign: {
                data: {
                  type: 'campaign',
                  id: klaviyoCampaignId,
                },
              },
            },
          },
        }),
      })

      if (!scheduleResponse.ok) {
        const errorText = await scheduleResponse.text()
        console.error('Klaviyo schedule error:', errorText)
        return NextResponse.json({ error: 'Failed to schedule campaign' }, { status: 500 })
      }

      finalStatus = 'scheduled'
    } else {
      // Send immediately
      const sendResponse = await fetch(`https://a.klaviyo.com/api/campaign-send-jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${klaviyoToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'revision': '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'campaign-send-job',
            relationships: {
              campaign: {
                data: {
                  type: 'campaign',
                  id: klaviyoCampaignId,
                },
              },
            },
          },
        }),
      })

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text()
        console.error('Klaviyo send error:', errorText)
        return NextResponse.json({ error: 'Failed to send campaign' }, { status: 500 })
      }
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

    return NextResponse.json({
      success: true,
      status: finalStatus,
      klaviyoCampaignId,
      templateId,
    })

  } catch (err) {
    console.error('Send campaign error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateEmailHtml(frames: Array<{
  name: string
  klaviyo_image_url: string | null
  link_url: string | null
}>): string {
  const frameHtml = frames.map(frame => {
    const imgTag = `<img src="${frame.klaviyo_image_url}" alt="${frame.name}" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;" />`

    if (frame.link_url) {
      return `<a href="${frame.link_url}" target="_blank" style="display: block;">${imgTag}</a>`
    }
    return imgTag
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    img {
      display: block;
      width: 100%;
      max-width: 600px;
      height: auto;
      border: 0;
    }
    a {
      display: block;
    }
  </style>
</head>
<body>
  <center style="width: 100%; background-color: #f4f4f4;">
    <div class="email-container">
      ${frameHtml}
    </div>
  </center>
</body>
</html>`
}
