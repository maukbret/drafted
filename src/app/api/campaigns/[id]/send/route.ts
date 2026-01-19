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

    // Get campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Get Klaviyo connection with refresh token
    const { data: klaviyoConnection } = await supabase
      .from('klaviyo_connections')
      .select('id, access_token, refresh_token, expires_at')
      .eq('id', campaign.klaviyo_connection_id)
      .single()

    if (!klaviyoConnection) {
      return NextResponse.json({ error: 'Klaviyo connection not found' }, { status: 400 })
    }

    // Get project with frames
    const { data: project } = campaign.project_id
      ? await supabase
          .from('projects')
          .select('*, frames(*)')
          .eq('id', campaign.project_id)
          .single()
      : { data: null }

    if (!project || !project.frames?.length) {
      return NextResponse.json({ error: 'No email content found' }, { status: 400 })
    }

    if (!campaign.subject_line) {
      return NextResponse.json({ error: 'Subject line is required' }, { status: 400 })
    }

    if (!campaign.included_audiences || campaign.included_audiences.length === 0) {
      return NextResponse.json({ error: 'At least one audience is required' }, { status: 400 })
    }

    // Check if token is expired and refresh if needed
    let klaviyoToken = klaviyoConnection.access_token
    const expiresAt = new Date(klaviyoConnection.expires_at)
    const now = new Date()

    if (expiresAt <= now && klaviyoConnection.refresh_token) {
      const refreshResponse = await fetch('https://a.klaviyo.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: klaviyoConnection.refresh_token,
          client_id: process.env.KLAVIYO_CLIENT_ID!,
          client_secret: process.env.KLAVIYO_CLIENT_SECRET!,
        }),
      })

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json()
        klaviyoToken = tokens.access_token

        await supabase
          .from('klaviyo_connections')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || klaviyoConnection.refresh_token,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('id', klaviyoConnection.id)
      } else {
        console.error('Failed to refresh Klaviyo token:', await refreshResponse.text())
        return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect Klaviyo.' }, { status: 401 })
      }
    }
    const frames = project.frames.sort((a: any, b: any) => a.display_order - b.display_order)

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
      return NextResponse.json({ error: 'Failed to create email template' }, { status: 500 })
    }

    const templateData = await templateResponse.json()
    const templateId = templateData.data?.id

    // Step 4: Create campaign in Klaviyo with embedded message (without template)
    // Build the campaign attributes
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
                from_email: '{{ organization.email }}',
                from_label: '{{ organization.name }}',
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

    // Add send_strategy if scheduling for later
    if (campaign.scheduled_at) {
      campaignAttributes.send_strategy = {
        method: 'static',
        options_static: {
          datetime: campaign.scheduled_at,
          is_local: false,
        },
      }
    }

    const campaignPayload = {
      data: {
        type: 'campaign',
        attributes: campaignAttributes,
      },
    }

    const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${klaviyoToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'revision': '2024-06-15',
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

    // Get the message ID from the relationships in the create response
    const messageId = campaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id

    console.log('Campaign created:', klaviyoCampaignId)
    console.log('Message ID:', messageId)

    if (!messageId) {
      console.error('No message ID found in campaign response')
      return NextResponse.json({ error: 'No message found in campaign' }, { status: 500 })
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
      return NextResponse.json({ error: 'Failed to assign template to campaign' }, { status: 500 })
    }

    console.log('Template assigned successfully')

    // Step 6: Trigger the send job (will send immediately or use the send_strategy schedule)
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
      return NextResponse.json({ error: 'Failed to send campaign' }, { status: 500 })
    }

    // Set status based on whether it was scheduled or sent immediately
    const finalStatus = campaign.scheduled_at ? 'scheduled' : 'sent'

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
