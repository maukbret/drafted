/**
 * Klaviyo boilerplate CSS scoped under .email-footer.
 *
 * Klaviyo compiles templates via a modified MJML pipeline that emits class-based
 * desktop/mobile toggles (desktop-only, mobile-only, kl-row, kl-column, etc.)
 * with a 480px breakpoint. When we inject a Klaviyo Universal Content block into
 * our own template, we must supply these CSS rules or the footer renders broken.
 *
 * All selectors are prefixed with .email-footer so they only apply inside the
 * footer cell and cannot interfere with our frame images or other body content.
 */
export const KLAVIYO_FOOTER_CSS = `
  /* Klaviyo footer resets */
  .email-footer table, .email-footer td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  .email-footer img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  .email-footer p { display: block; margin: 13px 0; }

  /* Desktop layout: center content and constrain images */
  .email-footer .kl-row { width: 100%; max-width: 600px; margin: 0 auto; }
  .email-footer .kl-column { vertical-align: top; }
  .email-footer td { text-align: center; }
  .email-footer img { max-width: 100%; height: auto; }
  .email-footer .kl-img-base-auto-width img { width: auto; }

  /* Desktop-first visibility toggles */
  .email-footer .mobile-only { display: none; max-height: 0px; overflow: hidden; }
  .email-footer .desktop-only { display: block; }
  .email-footer td.mobile-only { display: none; }
  .email-footer table.mobile-only { display: none; }

  /* Klaviyo 480px responsive breakpoint */
  @media only screen and (max-width: 480px) {
    .email-footer .kl-column { width: 100% !important; display: block !important; }
    .email-footer .kl-row { width: 100% !important; }
    .email-footer div.kl-row.colstack div.kl-column { display: block !important; width: 100% !important; }
    .email-footer .desktop-only { display: none !important; }
    .email-footer .mobile-only { display: block !important; max-height: none !important; overflow: visible !important; width: auto !important; }
    .email-footer td.mobile-only { display: table-cell !important; }
    .email-footer table.mobile-only { display: table !important; }
    .email-footer div.mobile-only { display: block !important; }
    .email-footer .table-desktop-only { max-height: 0 !important; display: none !important; mso-hide: all !important; overflow: hidden !important; }
    .email-footer .table-mobile-only { display: table-cell !important; max-height: none !important; }
    .email-footer .kl-text { padding-left: 18px !important; padding-right: 18px !important; }
    .email-footer .component-wrapper .mob-no-spc { padding-left: 0 !important; padding-right: 0 !important; }
    .email-footer td.kl-img-base-auto-width { width: 100% !important; }
    .email-footer .root-container { width: 100% !important; }
    .email-footer .content-padding { padding-left: 0 !important; padding-right: 0 !important; }
    .email-footer .kl-sl-stk { display: block !important; width: 100% !important; padding: 0 0 9px !important; text-align: center !important; }
    .email-footer .kl-sl-stk.lbls { padding: 0 !important; }
    .email-footer .kl-sl-stk.spcblk { display: none !important; }
  }
`
