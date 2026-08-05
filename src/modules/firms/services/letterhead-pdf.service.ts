// Server-side PDF rendering for anything that sits on the firm's LETTER HEAD — both the
// standalone blank letter head and the engagement letter. The single `renderLetterheadPdf`
// below is the shared engine so the header/footer are guaranteed identical everywhere.
//
// How it works (Puppeteer native running header/footer):
//   1. Build the header & footer templates + the body document (helpers/letterhead-html.helper).
//   2. MEASURE the real rendered height of the header and footer at true A4 width — because
//      the content is dynamic (variable address lines / footer image) and Puppeteer will NOT
//      size the reserved margin band for us.
//   3. Print with `displayHeaderFooter`, reserving margin.top = header height and
//      margin.bottom = footer height (side margins fixed), so nothing clips and there's no gap.
// The browser is launched on demand and closed as soon as the PDF is produced.
import puppeteer from 'puppeteer'
import {
  buildHeaderTemplate,
  buildFooterTemplate,
  buildMeasurementHtml,
  buildBodyDocument,
  getEmbeddedInterStyle,
  resolveFooterPath,
  FALLBACK_LETTERHEAD,
  SIDE_MARGIN_MM,
} from '../helpers/letterhead-html.helper'
import { authConfig } from '../../../config/auth.config'
import type { LetterheadContent } from '../types/firms.types'

// CSS px → mm (CSS defines 96px = 1in = 25.4mm). Used to turn measured template heights
// into the margin values Puppeteer reserves.
const PX_TO_MM = 25.4 / 96
// Tiny slack added to each measured band so sub-pixel rounding can never clip the header
// or let the body touch it.
const BAND_SAFETY_MM = 0.5

// Fetch the firm's footer image and return it as a base64 data URI. Images only load
// reliably inside a Puppeteer header/footer template when embedded this way (external URLs
// are flaky there). Reuses the frontend origin that serves the footer-image catalog.
async function resolveFooterImageDataUri(content: LetterheadContent): Promise<string | null> {
  const path = resolveFooterPath(content)
  if (!path) return null
  try {
    const res = await fetch(`${authConfig.frontendUrl}${path}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/png'
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  }
}

// Render a PDF that sits on the firm's letter head. `bodyInnerHtml` is the page body
// (the engagement-letter content, or '' for a blank letter head → one blank page).
// `content` is the firm's pinned letter-head content (header + footer image); falls back
// to a neutral default so generation can't crash if it's ever missing.
export async function renderLetterheadPdf(
  content: LetterheadContent = FALLBACK_LETTERHEAD,
  bodyInnerHtml: string = '',
): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    headless: true,
    // In Docker (Alpine) Chromium comes from the system package via
    // PUPPETEER_EXECUTABLE_PATH; locally that env is unset and Puppeteer uses its
    // bundled Chromium. --disable-dev-shm-usage avoids crashes on the tiny /dev/shm.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    // Assets first: embed Inter (once, cached) and the footer image, so both the
    // measurement page and the real print render with identical fonts/images.
    const fontStyle = getEmbeddedInterStyle()
    const footerDataUri = await resolveFooterImageDataUri(content)
    const headerTemplate = buildHeaderTemplate(content, fontStyle)
    const footerTemplate = buildFooterTemplate(footerDataUri, fontStyle)

    // ── Step 1: measure the real header/footer heights at A4 width ──
    const measurePage = await browser.newPage()
    await measurePage.setContent(buildMeasurementHtml(headerTemplate, footerTemplate), {
      waitUntil: 'load',
    })
    await measurePage.evaluate('document.fonts ? document.fonts.ready : null')
    const bands = (await measurePage.evaluate(`(() => {
      const h = document.getElementById('measure-header');
      const f = document.getElementById('measure-footer');
      return {
        headerPx: h ? h.getBoundingClientRect().height : 0,
        footerPx: f ? f.getBoundingClientRect().height : 0,
      };
    })()`)) as { headerPx: number; footerPx: number }
    await measurePage.close()

    const topMm = bands.headerPx * PX_TO_MM + BAND_SAFETY_MM
    const bottomMm = bands.footerPx * PX_TO_MM + BAND_SAFETY_MM

    // ── Step 2: print the body with the running header/footer, reserving the measured bands ──
    const page = await browser.newPage()
    await page.setContent(buildBodyDocument(bodyInnerHtml, fontStyle), { waitUntil: 'load' })
    // Force ALL Inter weights to decode before printing. The header/footer run in an
    // isolated context whose fonts aren't covered by document.fonts.ready; explicitly
    // loading every weight here warms the shared font cache so the running header/footer
    // render Inter too — otherwise an empty body (blank letter head) prints before Inter
    // is ready and silently falls back to the system font.
    await page.evaluate(`(async () => {
      if (!document.fonts) return
      await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(w + " 12px Inter")))
      await document.fonts.ready
    })()`)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: `${topMm}mm`,
        bottom: `${bottomMm}mm`,
        left: `${SIDE_MARGIN_MM}mm`,
        right: `${SIDE_MARGIN_MM}mm`,
      },
    })
    return pdf
  } finally {
    await browser.close()
  }
}

// Standalone blank letter head — the letter head with no body (one blank page).
export async function generateBlankLetterheadPdf(content: LetterheadContent): Promise<Uint8Array> {
  return renderLetterheadPdf(content, '')
}
