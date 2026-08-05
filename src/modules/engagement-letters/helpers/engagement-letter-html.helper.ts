// The engagement letter's header/footer ARE the firm's letter head, so all the shared
// markup, CSS and PDF rendering now live in the letter-head helper/service under `firms`
// (single source of truth — change it once, both PDFs update). This module only re-exports
// the two small utilities the engagement-letter template code still imports from here.
export { escapeHtml, FALLBACK_LETTERHEAD } from '../../firms/helpers/letterhead-html.helper'
