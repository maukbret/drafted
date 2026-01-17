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

    // Get project with its Klaviyo connection
    const { data: project } = await supabase
      .from('projects')
      .select('*, klaviyo_connections(access_token)')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.klaviyo_connection_id || !project.klaviyo_connections) {
      return NextResponse.json({ error: 'No Klaviyo account linked to this project' }, { status: 400 })
    }

    const klaviyoToken = (project.klaviyo_connections as any).access_token

    // Get frames
    const { data: frames } = await supabase
      .from('frames')
      .select('*')
      .eq('project_id', projectId)
      .order('display_order', { ascending: true })

    if (!frames || frames.length === 0) {
      return NextResponse.json({ error: 'No frames found' }, { status: 400 })
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

    // Step 2: Generate HTML email
    const html = generateEmailHtml(uploadedFrames)

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
