-- Klaviyo template-render leaves href="[unsubscribe_tag]" in footer HTML; CODE templates
-- need {% unsubscribe_link %} so Klaviyo resolves the URL and does not append a default footer.
UPDATE public.klaviyo_footers
SET
  footer_html = regexp_replace(footer_html, '\[unsubscribe_tag\]', '{% unsubscribe_link %}', 'gi'),
  updated_at = now()
WHERE footer_html ~* '\[unsubscribe_tag\]';
