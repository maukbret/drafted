export interface ProductFeedPreset {
  layout: '1-column' | '2-column' | '3-column'
  button_color: string
  button_text_color: string
  button_text: string
  show_price: boolean
  show_title: boolean
  image_ratio: 'square' | 'original'
}

export interface ProductFeedSettings {
  feedName: string
  productCount: number
}

export function generateProductFeedHtml(
  preset: ProductFeedPreset,
  feedSettings: ProductFeedSettings
): string {
  const cols = preset.layout === '1-column' ? 1 : preset.layout === '2-column' ? 2 : 3
  const colWidth = Math.floor(600 / cols)
  const imgStyle = preset.image_ratio === 'square'
    ? `width: ${colWidth}px; height: ${colWidth}px; object-fit: cover;`
    : `width: 100%; height: auto;`

  const titleBlock = preset.show_title
    ? `<tr>
                  <td align="center" style="padding: 8px 8px 0; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; color: #333333; line-height: 1.3;">
                    {{ catalog_item.title }}
                  </td>
                </tr>`
    : ''

  const priceBlock = preset.show_price
    ? `<tr>
                  <td align="center" style="padding: 4px 8px 0; font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #666666;">
                    {{ catalog_item.metadata|lookup:'Price' }}
                  </td>
                </tr>`
    : ''

  const buttonBlock = `<tr>
                  <td align="center" style="padding: 12px 8px 16px;">
                    <a href="{{ catalog_item.url }}" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: ${preset.button_color}; color: ${preset.button_text_color}; font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 4px; line-height: 1;">
                      ${preset.button_text}
                    </a>
                  </td>
                </tr>`

  const productCard = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${colWidth}" style="display: inline-block; vertical-align: top; width: ${colWidth}px;">
                <tr>
                  <td align="center" style="padding: 8px;">
                    <a href="{{ catalog_item.url }}" target="_blank" style="display: block; text-decoration: none;">
                      <img src="{{ catalog_item.featured_image.full.url }}" alt="{{ catalog_item.title }}" width="${colWidth - 16}" style="${imgStyle} display: block; border: 0; outline: none; text-decoration: none;" />
                    </a>
                  </td>
                </tr>
${titleBlock}
${priceBlock}
${buttonBlock}
              </table>`

  // Sanitize feed name for use in template tag (allow alphanumeric, spaces, hyphens, underscores)
  const safeFeedName = feedSettings.feedName.replace(/[^a-zA-Z0-9 _-]/g, '')

  return `<!-- Product Feed -->
      <tr>
        <td align="center" valign="top" style="padding: 20px 0;">
          {% for item in feeds.${safeFeedName}|slice:${feedSettings.productCount} %}
          {% catalog item.item_id %}
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
            <tr>
              <td align="center" valign="top">
${productCard}
              </td>
            </tr>
          </table>
          {% endcatalog %}
          {% endfor %}
        </td>
      </tr>`
}
