// Server-side PDF generation for an engagement letter.
//
// Renders the body HTML (helpers/engagement-letter-html.helper) to A4 via headless
// Chromium and prints it with a native running header/footer (Puppeteer's
// `displayHeaderFooter`). The header/footer are the FIRM's own letter head — built
// from the letter-head content passed in — painted into the page's top/bottom
// margin band on EVERY page, outside the content flow, so the body never overlaps
// them; `margin.top`/`margin.bottom` reserve those bands.
//
// The browser is launched on demand and closed as soon as the PDF is produced.
import puppeteer from 'puppeteer'
import {
  buildEngagementLetterDocument,
  buildHeaderTemplate,
  buildFooterTemplate,
  FALLBACK_LETTERHEAD,
  PAGE_MARGINS,
} from '../helpers/engagement-letter-html.helper'
import { getTemplate, LATEST_VERSION } from '../templates'
import { footerImagePath } from '../../../config/letterhead-footer-images.constants'
import { authConfig } from '../../../config/auth.config'
import type { LetterheadContent } from '../../firms/types/firms.types'

// Fetch the firm's footer image and return it as a base64 data URI. Images only
// load reliably inside a Puppeteer header/footer template when embedded this way
// (external URLs are flaky there). Reuses the frontend origin that already serves
// the footer-image catalog. Returns null if there's no image or it can't be loaded.
async function resolveFooterImageDataUri(imageKey: string | null | undefined): Promise<string | null> {
  const path = footerImagePath(imageKey)
  if (!path) return null
  try {
    // Bound the fetch so a slow/unreachable frontend can never stall generation.
    const res = await fetch(`${authConfig.frontendUrl}${path}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  }
}

// Launch Chromium, render the body, print to A4 with the firm's running header/
// footer, and close the browser. Returns the raw PDF bytes.
//
// `version`/`params` pick the template and its values. `letterhead` is the firm's
// pinned letter-head content (header + footer image); it falls back to a neutral
// default so generation can't crash if that content is ever missing.
export async function generateEngagementLetterPdf(
  version: string = LATEST_VERSION,
  params: Record<string, unknown> = {},
  letterhead: LetterheadContent = FALLBACK_LETTERHEAD,
): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    headless: true,
    // In Docker (Alpine) Chromium comes from the system package via
    // PUPPETEER_EXECUTABLE_PATH; locally that env is unset and Puppeteer uses its
    // bundled Chromium. --disable-dev-shm-usage avoids crashes on the tiny
    // /dev/shm inside containers.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const template = getTemplate(version)
    const bodyHtml = buildEngagementLetterDocument(template.renderBody(params))

    // Build the firm's running header/footer from its pinned letter head. The footer
    // image is base64-embedded (see resolveFooterImageDataUri), so once the body is
    // set there are NO external resources to load — we can print immediately. (An
    // earlier `waitForNetworkIdle()`/font-ready wait was here from when the footer
    // loaded via URL; with the data URI it only ever hung, leaking the browser.)
    const headerTemplate = buildHeaderTemplate(letterhead)
    const footerDataUri = await resolveFooterImageDataUri(letterhead.footer?.image_key)
    const footerTemplate = buildFooterTemplate(footerDataUri)

    const page = await browser.newPage()
    await page.setContent(bodyHtml, { waitUntil: 'load' })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: PAGE_MARGINS.top,
        bottom: PAGE_MARGINS.bottom,
        left: PAGE_MARGINS.side,
        right: PAGE_MARGINS.side,
      },
    })
    return pdf
  } finally {
    await browser.close()
  }
}
