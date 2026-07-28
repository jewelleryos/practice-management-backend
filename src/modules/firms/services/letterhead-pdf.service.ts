// Server-side PDF generation for a firm letter head (blank letterhead only, for now).
//
// The letter-head content is rendered to an HTML page (see helpers/letterhead-html.helper)
// that mirrors the on-screen preview, and printed to A4 by headless Chromium via
// Puppeteer. The browser is launched on demand and closed as soon as the PDF is
// produced — no long-lived instance.
//
// Assets: the footer image is loaded directly from the FRONTEND URL and Inter from
// Google Fonts (both resolved in the HTML helper). Both need network; we wait for the
// network to go idle (and for fonts to settle) before printing.
import puppeteer from 'puppeteer'
import { buildBlankLetterheadHtml } from '../helpers/letterhead-html.helper'
import type { LetterheadContent } from '../types/firms.types'

// Launch Chromium, render the blank letterhead, print to A4, and close the browser.
// Returns the raw PDF bytes.
export async function generateBlankLetterheadPdf(content: LetterheadContent): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    headless: true,
    // In Docker (Alpine) we run Chromium from the system package, pointed to by
    // PUPPETEER_EXECUTABLE_PATH. Locally that env is unset, so Puppeteer falls back to
    // its own bundled Chromium. --disable-dev-shm-usage avoids crashes from the tiny
    // /dev/shm inside containers.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    // setContent's waitUntil doesn't support networkidle, so load first then wait for
    // the network (footer image + Google Fonts) to go idle before printing.
    await page.setContent(buildBlankLetterheadHtml(content), { waitUntil: 'load' })
    await page.waitForNetworkIdle()
    // Make sure webfonts have finished loading before we snapshot the page. Passed as a
    // string so the browser-side `document` isn't type-checked against the server libs.
    await page.evaluate('document.fonts ? document.fonts.ready : null')
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return pdf
  } finally {
    await browser.close()
  }
}
