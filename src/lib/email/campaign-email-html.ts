import { buildEmailFrameRowsHtml, type EmailFrameRowInput } from '@/lib/email/frame-rows-html'
import { normalizeFooterCssForExport, normalizeFooterHtmlForExport } from '@/lib/email/footer-normalize'

export type CampaignEmailHtmlOptions = {
  /** Klaviyo hybrid region between frame rows and footer (opens drag-and-drop editor) */
  includeKlaviyoHybridSlot?: boolean
}

/**
 * Klaviyo hybrid template slot: one region; placeholder text block per
 * https://help.klaviyo.com/hc/en-us/articles/115005254188
 */
function buildKlaviyoHybridEditorSectionRow(): string {
  return `
      <tr>
        <td align="center" valign="top" style="padding: 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td align="center" data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
                <div class="klaviyo-block klaviyo-text-block">
                  Add product feeds, universal content, or other blocks in Klaviyo (drag-and-drop). Remove this text when done.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
}

export function generateCampaignEmailHtml(
  frames: EmailFrameRowInput[],
  footerHtml: string = '',
  previewText: string = '',
  footerCss: string = '',
  options?: CampaignEmailHtmlOptions
): string {
  const frameRows = buildEmailFrameRowsHtml(frames)
  const hybridRows = options?.includeKlaviyoHybridSlot ? buildKlaviyoHybridEditorSectionRow() : ''

  const normalizedFooter = normalizeFooterHtmlForExport(footerHtml)
  const normalizedCss = footerCss ? normalizeFooterCssForExport(footerCss) : ''
  const footerSection = normalizedFooter ? `
      <tr>
        <td align="center" valign="top" style="padding: 0;" class="email-footer">
          <!-- Footer -->
${normalizedFooter}
        </td>
      </tr>` : ''

  const previewBlock = buildHiddenPreheaderBlock(previewText)

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
      .email-container table[width="600"] { width: 100% !important; }
      .email-container td[width="300"] { width: 50% !important; display: inline-block !important; }
      .email-container td[width="200"] { width: 33.33% !important; display: inline-block !important; }
    }
${normalizedCss ? `    /* Preserved Klaviyo footer styles */\n${normalizedCss}` : ''}
    /* iOS blue link fix */
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    /* Gmail blue link fix */
    u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
    /* Samsung Mail blue link fix */
    #MessageViewBody a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
  </style>
</head>
<body id="body" style="margin: 0 !important; padding: 0 !important; background-color: #f4f4f4;">
${previewBlock}
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
${frameRows}${hybridRows}
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildHiddenPreheaderBlock(previewText: string): string {
  const safePreviewText = escapeHtml(previewText.trim())
  const preheaderSpacer = '&nbsp;&zwnj;'.repeat(160)

  return `
  <div style="display:none; font-size:1px; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden; mso-hide:all; color:transparent;">
    ${safePreviewText || '&nbsp;'}
  </div>
  <div style="display:none; font-size:1px; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden; mso-hide:all; color:transparent;">
    ${preheaderSpacer}
  </div>`
}
