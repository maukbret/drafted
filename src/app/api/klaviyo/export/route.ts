import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get project
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.klaviyo_connection_id) {
      return NextResponse.json({ error: 'No Klaviyo account linked to this project' }, { status: 400 })
    }

    // Get Klaviyo connection with refresh token and account ID
    const { data: klaviyoConnection } = await supabase
      .from('klaviyo_connections')
      .select('id, klaviyo_account_id, access_token, refresh_token, expires_at')
      .eq('id', project.klaviyo_connection_id)
      .single()

    if (!klaviyoConnection) {
      return NextResponse.json({ error: 'Klaviyo connection not found' }, { status: 400 })
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

    // Get frames
    const { data: frames } = await supabase
      .from('frames')
      .select('*')
      .eq('project_id', projectId)
      .order('display_order', { ascending: true })

    if (!frames || frames.length === 0) {
      return NextResponse.json({ error: 'No frames found' }, { status: 400 })
    }

    // Fetch stored footer HTML for this Klaviyo account
    let footerHtml = ''
    if (klaviyoConnection.klaviyo_account_id) {
      const { data: footer } = await supabase
        .from('klaviyo_footers')
        .select('footer_html')
        .eq('user_id', user.id)
        .eq('klaviyo_account_id', klaviyoConnection.klaviyo_account_id)
        .single()

      if (footer) {
        footerHtml = footer.footer_html
      }
    }

    // Step 1: Upload images to Klaviyo and get hosted URLs
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

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text()
          console.error('Klaviyo image upload error:', errorText)
          // Continue with original URL if upload fails
          uploadedFrames.push({
            ...frame,
            klaviyo_image_url: frame.image_url,
          })
        } else {
          const imageData = await imageResponse.json()
          const klaviyoImageUrl = imageData.data?.attributes?.image_url || frame.image_url
          
          uploadedFrames.push({
            ...frame,
            klaviyo_image_url: klaviyoImageUrl,
          })

          // Update frame in database with Klaviyo URL
          await supabase
            .from('frames')
            .update({ klaviyo_image_url: klaviyoImageUrl })
            .eq('id', frame.id)
        }
      } catch (err) {
        console.error('Image upload error:', err)
        uploadedFrames.push({
          ...frame,
          klaviyo_image_url: frame.image_url,
        })
      }
    }

    // Step 2: Generate HTML email with footer
    const html = generateEmailHtml(uploadedFrames, footerHtml)

    // Step 3: Create template in Klaviyo
    const templateName = project.name || `Figma Import - ${new Date().toLocaleDateString('en-GB')}`
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
      return NextResponse.json({ error: 'Failed to create Klaviyo template' }, { status: 500 })
    }

    const templateData = await templateResponse.json()

    // Update project status
    await supabase
      .from('projects')
      .update({ status: 'exported' })
      .eq('id', projectId)

    return NextResponse.json({
      success: true,
      templateId: templateData.data?.id,
    })

  } catch (err) {
    console.error('Klaviyo export error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Half-width threshold: 50% of 600px email width
const HALF_WIDTH_THRESHOLD = 300

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

  const footerSection = footerHtml ? `
        <!-- Footer -->
${footerHtml}` : ''

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
        <!-- Email content table -->
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff;">
${frameRows}
${footerSection}
        </table>
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
