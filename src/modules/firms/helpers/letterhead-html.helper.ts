// Single source of truth for the firm LETTER-HEAD header & footer — shared by BOTH
// the standalone letter-head PDF and the engagement-letter PDF, so the two can never
// drift apart. Change a font size / color / line height here and it reflects in both.
//
// Both PDFs render the header/footer with Puppeteer's NATIVE running header/footer
// (`displayHeaderFooter`): Chromium paints `headerTemplate` into the top margin band
// and `footerTemplate` into the bottom margin band of EVERY page. The body flows in
// between and can never overlap them.
//
// The header/footer content is DYNAMIC (a firm may have few or many address lines, a
// short or tall footer image), and Puppeteer does NOT auto-size the reserved margin to
// fit it — you must reserve a fixed band yourself. So the PDF service MEASURES the real
// rendered height of these templates and reserves exactly that (see letterhead-pdf.service).
// The helpers here just produce the markup + CSS; the measuring/printing lives in the service.
//
// Fonts: the header/footer templates render in an ISOLATED context that will not load
// Google Fonts, so Inter is BUNDLED locally and embedded as a base64 @font-face
// (getEmbeddedInterStyle) and used everywhere — header, footer, and body — so all three match.
import { readFileSync } from 'fs'
import { footerImagePath } from '../../../config/letterhead-footer-images.constants'
import type { LetterheadContent } from '../types/firms.types'

// Design tokens copied from the frontend Tailwind config so the PDF matches the
// on-screen preview (final-frontend/tailwind.config.ts).
const COLORS = {
  navy: '#0A1F44',
  ink: '#1f2733',
  inkMuted: '#5b6573',
}

const FONT_STACK = `'Inter', 'Avenir Next', 'Segoe UI', system-ui, sans-serif`

// Page insets shared by both documents (millimetres). SIDE aligns the header/footer
// with the body column; EDGE is the small gap above the header / below the footer.
// (Mirrors the old letter-head `.page { padding: 2mm 4mm }`.)
export const SIDE_MARGIN_MM = 4
export const EDGE_MARGIN_MM = 2
// Breathing room between the header and the body, and between the body and the footer.
// It's baked into the header/footer TEMPLATES — NOT the body — so it's identical on EVERY
// page and included in the reserved margin band. (A body top/bottom padding would only
// land on the first/last page, so continuation pages would open/close tighter.)
export const HEADER_BODY_GAP_MM = 10

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Neutral fallback letter head. Real letters/letterheads always pass the firm's pinned
// content; this only prevents a crash if that content is ever missing/unloadable.
export const FALLBACK_LETTERHEAD: LetterheadContent = {
  header: {
    top_row: { left: null, middle: null, right: null },
    company_name: '',
    lines: [],
  },
  footer: { image_key: '' },
}

// ── Shared block CSS ──
// The visual definition of the header & footer. Line heights are FIXED in px so the
// header is a predictable height (dynamic line counts add/remove whole 18px rows) and
// so both documents reserve identical space. This is the ONE place to tweak the look.
const BLOCK_CSS = `
  .top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid rgba(31, 39, 51, 0.7);
    padding-bottom: 4px;
    font-size: 11px;
    line-height: 15px;
    font-weight: 600;
    color: ${COLORS.ink};
  }
  .top-row .seg { white-space: nowrap; text-align: left; }
  .top-row .seg-center { text-align: center; }
  .top-row .seg-right { text-align: right; }

  .company {
    padding: 8px 0;
    text-align: center;
    font-size: 30px;
    line-height: 33px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    color: ${COLORS.navy};
  }

  .lines {
    border-top: 1px solid rgba(31, 39, 51, 0.4);
    padding-top: 8px;
    text-align: center;
  }
  .lines p {
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    color: ${COLORS.ink};
  }

  .header-rule {
    border-top: 1px solid rgba(31, 39, 51, 0.7);
    margin-top: 10px;
  }

  .footer {
    border-top: 1px solid rgba(31, 39, 51, 0.4);
    padding-top: 12px;
  }
  .footer-img { display: block; height: auto; max-height: 64px; width: auto; }
  .footer-missing { font-size: 13px; color: ${COLORS.inkMuted}; padding: 8px 0; }
  .footer-note {
    margin-top: 8px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    font-size: 11px;
    line-height: 15px;
    color: ${COLORS.inkMuted};
  }
  .footer-note .note-left { text-align: left; }
  .footer-note .note-page { text-align: right; white-space: nowrap; }
`

// ── Embedded Inter (base64) ──
// Inter is BUNDLED with the source (src/assets/fonts/inter-<weight>.woff2, latin subset)
// and inlined as base64 @font-face rules, so it renders even in Puppeteer's isolated
// header/footer context. This is intentionally NOT a runtime download: fetching from
// Google Fonts was non-deterministic (a slow/failed fetch silently fell back to the
// system font — Noto Sans on Linux — which made the two PDFs use DIFFERENT fonts). Local
// files always load, so every PDF uses Inter identically. Read once, cached for the process.
// If the files are somehow missing, we fall back to the system stack (both PDFs still match).
const FONT_WEIGHTS = [400, 500, 600, 700, 800]
let cachedFontStyle: string | null = null

export function getEmbeddedInterStyle(): string {
  if (cachedFontStyle !== null) return cachedFontStyle
  try {
    const faces = FONT_WEIGHTS.map((weight) => {
      const file = new URL(`../../../assets/fonts/inter-${weight}.woff2`, import.meta.url)
      const base64 = readFileSync(file).toString('base64')
      return (
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};` +
        `font-display:swap;src:url(data:font/woff2;base64,${base64}) format('woff2');}`
      )
    })
    cachedFontStyle = `<style>${faces.join('')}</style>`
  } catch {
    cachedFontStyle = '' // system fallback; both PDFs still match each other
  }
  return cachedFontStyle
}

// Resolve the footer image to a public path (path added on read, else from the key).
function resolveFooterPath(content: LetterheadContent): string | null {
  return content.footer?.image_path ?? footerImagePath(content.footer?.image_key) ?? null
}

// ── Header template (painted into the top margin band on every page) ──
// `fontStyle` is the embedded-Inter <style> from getEmbeddedInterStyle().
export function buildHeaderTemplate(content: LetterheadContent, fontStyle: string): string {
  const header = content.header
  const top = header.top_row ?? { left: null, middle: null, right: null }
  const hasTopRow = !!(top.left || top.middle || top.right)
  const lines = (header.lines ?? []).filter((l) => l.trim() !== '')

  const topRowHtml = hasTopRow
    ? `<div class="top-row">
         <span class="seg">${escapeHtml(top.left ?? '')}</span>
         <span class="seg seg-center">${escapeHtml(top.middle ?? '')}</span>
         <span class="seg seg-right">${escapeHtml(top.right ?? '')}</span>
       </div>`
    : ''

  const linesHtml = lines.length
    ? `<div class="lines">${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>`
    : ''

  return `${fontStyle}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  ${BLOCK_CSS}
  .lh-header {
    width: 100%;
    font-family: ${FONT_STACK};
    color: ${COLORS.ink};
    padding: ${EDGE_MARGIN_MM}mm ${SIDE_MARGIN_MM}mm ${HEADER_BODY_GAP_MM}mm ${SIDE_MARGIN_MM}mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
<div class="lh-header">
  ${topRowHtml}
  <div class="company">${escapeHtml(header.company_name || '')}</div>
  ${linesHtml}
  <div class="header-rule"></div>
</div>`
}

// ── Footer template (painted into the bottom margin band on every page) ──
// `footerImageDataUri` is the base64 footer image (or null); `fontStyle` as above.
export function buildFooterTemplate(footerImageDataUri: string | null, fontStyle: string): string {
  const footerHtml = footerImageDataUri
    ? `<img src="${footerImageDataUri}" alt="Letter head footer" class="footer-img" />`
    : `<p class="footer-missing">Footer image unavailable.</p>`

  return `${fontStyle}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  ${BLOCK_CSS}
  .lh-footer {
    width: 100%;
    font-family: ${FONT_STACK};
    color: ${COLORS.inkMuted};
    padding: ${HEADER_BODY_GAP_MM}mm ${SIDE_MARGIN_MM}mm ${EDGE_MARGIN_MM}mm ${SIDE_MARGIN_MM}mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
<div class="lh-footer">
  <div class="footer">
    ${footerHtml}
    <div class="footer-note">
      <span class="note-left">Liability limited by a scheme approved under Professional Standards Legislation</span>
      <span class="note-page">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  </div>
</div>`
}

// A standalone HTML page that renders BOTH templates at true A4 width so their heights
// can be measured (see the PDF service). Distinct wrapper ids; identical to how each
// template renders when Puppeteer paints it.
export function buildMeasurementHtml(headerTemplate: string, footerTemplate: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style> * { margin: 0; padding: 0; box-sizing: border-box; } body { background: #fff; } </style>
</head><body>
  <div id="measure-header" style="width:210mm;">${headerTemplate}</div>
  <div id="measure-footer" style="width:210mm;">${footerTemplate}</div>
</body></html>`
}

// The BODY document (no header/footer — those are the running templates). `bodyInnerHtml`
// is the engagement-letter body, or '' for a blank letter head (→ one blank page).
export function buildBodyDocument(bodyInnerHtml: string, fontStyle: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
${fontStyle}
<style>
  /* Top/bottom (header/footer bands) & side margins are set by page.pdf({ margin }). */
  @page { size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; }
  body {
    font-family: ${FONT_STACK};
    color: ${COLORS.ink};
    font-size: 14px;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }
  /* Small left/right inset so the body text doesn't run to the header/footer edges.
     Top/bottom breathing room lives in the header/footer templates (see HEADER_BODY_GAP_MM)
     so it's identical on every page, not just the first/last. */
  .letter-body { padding: 0 10px; }
  .letter-body p { margin-bottom: 13px; text-align: justify; }
  .para-no { font-weight: 700; color: ${COLORS.navy}; margin-right: 4px; }
  .body-title { font-size: 15px; font-weight: 700; color: ${COLORS.navy}; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="letter-body">
    ${bodyInnerHtml}
  </div>
</body>
</html>`
}

export { resolveFooterPath }
