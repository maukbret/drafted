import { createClient } from '@/lib/supabase/server'
import { deleteFrameImageByUrl } from '@/lib/frame-images-server'
import { ensureKlaviyoAccountId, getValidKlaviyoToken } from '@/lib/klaviyo'
import { generateCampaignEmailHtml } from '@/lib/email/campaign-email-html'
import { normalizeFooterHtmlForExport, normalizeFooterCssForExport } from '@/lib/email/footer-normalize'
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

    // Get Klaviyo connection for account ID
    const { data: klaviyoConnection } = await supabase
      .from('klaviyo_connections')
      .select('id, klaviyo_account_id')
      .eq('id', project.klaviyo_connection_id)
      .single()

    if (!klaviyoConnection) {
      return NextResponse.json({ error: 'Klaviyo connection not found' }, { status: 400 })
    }

    // Get valid token (refreshes automatically if needed)
    const klaviyoToken = await getValidKlaviyoToken(supabase, klaviyoConnection.id)

    if (!klaviyoToken) {
      return NextResponse.json({ error: 'Klaviyo token expired. Please reconnect Klaviyo.' }, { status: 401 })
    }

    const klaviyoAccountId = klaviyoConnection.klaviyo_account_id
      || await ensureKlaviyoAccountId(supabase, klaviyoConnection.id, { accessToken: klaviyoToken })

    // Get frames
    const { data: frames } = await supabase
      .from('frames')
      .select('*')
      .eq('project_id', projectId)
      .order('display_order', { ascending: true })

    if (!frames || frames.length === 0) {
      return NextResponse.json({ error: 'No frames found' }, { status: 400 })
    }

    // Fetch stored footer HTML and CSS for this Klaviyo account
    let footerHtml = ''
    let footerCss = ''
    if (klaviyoAccountId) {
      const { data: footer } = await supabase
        .from('klaviyo_footers')
        .select('footer_html, footer_css')
        .eq('user_id', user.id)
        .eq('klaviyo_account_id', klaviyoAccountId)
        .single()

      if (footer) {
        footerHtml = footer.footer_html
        footerCss = footer.footer_css || ''
      }
    }

    // Step 1: Upload images to Klaviyo and get hosted URLs
    const uploadedFrames = []
    for (const frame of frames) {
      const sourceImageUrl = normalizeImageUrl(frame.image_url)
      const existingKlaviyoImageUrl = normalizeImageUrl(frame.klaviyo_image_url)
      const fallbackImageUrl = existingKlaviyoImageUrl || sourceImageUrl
      if (!fallbackImageUrl) continue
      if (existingKlaviyoImageUrl) {
        const deletedSourceImage = await deleteFrameImageByUrl(sourceImageUrl)
        if (deletedSourceImage) {
          await supabase
            .from('frames')
            .update({ image_url: null })
            .eq('id', frame.id)
        }

        uploadedFrames.push({
          ...frame,
          image_url: deletedSourceImage ? null : frame.image_url,
          klaviyo_image_url: existingKlaviyoImageUrl,
        })
        continue
      }

      try {
        const imageResponse = await fetch('https://a.klaviyo.com/api/images', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${klaviyoToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'revision': '2026-01-15',
          },
          body: JSON.stringify({
            data: {
              type: 'image',
              attributes: {
                name: frame.name,
                import_from_url: sourceImageUrl,
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
            klaviyo_image_url: fallbackImageUrl,
          })
        } else {
          const imageData = await imageResponse.json()
          const klaviyoImageUrl = normalizeImageUrl(imageData.data?.attributes?.image_url) || fallbackImageUrl
          const deletedSourceImage = await deleteFrameImageByUrl(sourceImageUrl)
          
          uploadedFrames.push({
            ...frame,
            image_url: deletedSourceImage ? null : frame.image_url,
            klaviyo_image_url: klaviyoImageUrl,
          })

          // Update frame in database with Klaviyo URL
          await supabase
            .from('frames')
            .update({
              image_url: deletedSourceImage ? null : frame.image_url,
              klaviyo_image_url: klaviyoImageUrl,
            })
            .eq('id', frame.id)
        }
      } catch (err) {
        console.error('Image upload error:', err)
        uploadedFrames.push({
          ...frame,
          klaviyo_image_url: fallbackImageUrl,
        })
      }
    }

    // Step 2: Generate HTML email with footer
    const html = generateCampaignEmailHtml(uploadedFrames, footerHtml, '', footerCss)

    // Step 3: Create template in Klaviyo
    const templateName = project.name || `Figma Import - ${new Date().toLocaleDateString('en-GB')}`
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

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const normalized = url.trim()
  if (!normalized || normalized === 'null' || normalized === 'undefined') return null
  return normalized
}
