// Server-side PDF generation for an engagement letter.
//
// The engagement letter sits on the firm's LETTER HEAD, so it reuses the shared
// letter-head render engine (firms/services/letterhead-pdf.service). That engine builds
// the identical header/footer, measures them, and prints with Puppeteer's native running
// header/footer on every page — the same code the standalone letter head uses, so the two
// can never look different. Here we only pick the template version and render its body.
import { renderLetterheadPdf } from '../../firms/services/letterhead-pdf.service'
import { FALLBACK_LETTERHEAD } from '../helpers/engagement-letter-html.helper'
import { getTemplate, LATEST_VERSION } from '../templates'
import type { LetterheadContent } from '../../firms/types/firms.types'

// Render the engagement letter to a PDF on the firm's letter head. `version`/`params` pick
// the template and its values; `letterhead` is the firm's pinned letter-head content.
export async function generateEngagementLetterPdf(
  version: string = LATEST_VERSION,
  params: Record<string, unknown> = {},
  letterhead: LetterheadContent = FALLBACK_LETTERHEAD,
): Promise<Uint8Array> {
  const template = getTemplate(version)
  return renderLetterheadPdf(letterhead, template.renderBody(params))
}
