// HTML for the engagement-letter PDF.
//
// The header and footer are the FIRM's own letter head — the exact version pinned
// to the letter (firm_letterheads.content). They repeat on every page; the body
// flows between them without ever overlapping.
//
// Rendering approach — Puppeteer `displayHeaderFooter` (native running header/footer):
//   - The BODY is a plain document (helpers below build it); it just flows.
//   - The HEADER and FOOTER are separate template fragments handed to
//     `page.pdf({ headerTemplate, footerTemplate })`. Chromium paints them into
//     the page's TOP/BOTTOM MARGIN band on every page — outside the content flow —
//     so the body can never overlap them. `page.pdf({ margin })` reserves the band.
//   - Templates render in an isolated context: they get NO shared stylesheet and a
//     tiny default font, so every style is INLINED and font sizes are explicit.
//     `page.pdf` left/right margins do NOT inset templates (they're full page
//     width), so each template carries its own horizontal padding equal to the
//     side margin to line up with the body column.
//   - Images in a header/footer template only load reliably as an embedded base64
//     data URI (external URLs are flaky in the template context), so the footer
//     image is passed in already encoded — see the PDF service.
import type { LetterheadContent } from '../../firms/types/firms.types'

// Design tokens mirrored from the frontend so the PDF matches the app look
// (final-frontend/tailwind.config.ts).
const COLORS = {
  navy: '#0A1F44',
  ink: '#1f2733',
  inkMuted: '#5b6573',
}

// Page margins (the top/bottom values are the reserved header/footer bands). The
// header/footer templates must fit inside the top/bottom bands respectively — the
// top band is generous so a firm with a tall header (several address lines) isn't
// clipped.
export const PAGE_MARGINS = {
  top: '44mm',
  bottom: '26mm',
  side: '16mm',
}

// Shared HTML escaper — templates use it when merging parameter values.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Neutral fallback letter head. Real letters always pass the firm's pinned letter
// head; this is only a defensive default so PDF generation can't crash if that
// content is ever missing/unloadable.
export const FALLBACK_LETTERHEAD: LetterheadContent = {
  header: {
    top_row: { left: null, middle: null, right: null },
    company_name: '',
    lines: [],
  },
  footer: { image_key: '' },
}

// ── Header template (painted into the top margin band on every page) ──
// Built from the firm's letter-head content. Fully inlined styles + explicit font
// sizes (template context has no stylesheet). Mirrors the on-screen letter-head
// preview, sized a touch smaller since it repeats as a running header.
export function buildHeaderTemplate(content: LetterheadContent): string {
  const header = content.header
  const top = header.top_row ?? { left: null, middle: null, right: null }
  const hasTopRow = !!(top.left || top.middle || top.right)
  const lines = (header.lines ?? []).filter((l) => l.trim() !== '')

  const topRowHtml = hasTopRow
    ? `<div style="display:flex; justify-content:space-between; gap:12px; font-size:8.5px; font-weight:600;
                   color:${COLORS.ink}; border-bottom:1px solid rgba(31,39,51,0.7); padding-bottom:3px;">
         <span style="white-space:nowrap;">${escapeHtml(top.left ?? '')}</span>
         <span style="flex:1; text-align:center;">${escapeHtml(top.middle ?? '')}</span>
         <span style="white-space:nowrap; text-align:right;">${escapeHtml(top.right ?? '')}</span>
       </div>`
    : ''

  const linesHtml = lines.length
    ? `<div style="border-top:1px solid rgba(31,39,51,0.4); padding-top:4px; text-align:center;">
         ${lines
           .map(
             (l) =>
               `<div style="font-size:9px; font-weight:500; line-height:14px; color:${COLORS.ink};">${escapeHtml(l)}</div>`,
           )
           .join('')}
       </div>`
    : ''

  return `
  <div style="width:100%; box-sizing:border-box; padding:6mm ${PAGE_MARGINS.side} 0 ${PAGE_MARGINS.side};
              font-family:'Inter','Segoe UI',Arial,sans-serif; color:${COLORS.ink};
              -webkit-print-color-adjust:exact;">
    ${topRowHtml}
    <div style="text-align:center; font-size:20px; font-weight:800; letter-spacing:0.03em;
                text-transform:uppercase; color:${COLORS.navy}; padding:4px 0 3px;">${escapeHtml(header.company_name || '')}</div>
    ${linesHtml}
    <div style="border-top:1px solid rgba(31,39,51,0.6); margin-top:5px;"></div>
  </div>`
}

// ── Footer template (painted into the bottom margin band on every page) ──
// The firm's footer image (accreditation logos), LEFT-aligned, with a fixed
// professional-standards line below it. The line is STATIC (always shown, same for
// every firm). `footerImageDataUri` is a base64 data URI (or null if the firm has no
// footer image / it couldn't be loaded).
export function buildFooterTemplate(footerImageDataUri: string | null): string {
  const imgHtml = footerImageDataUri
    ? `<img src="${footerImageDataUri}" style="display:block; height:auto; max-height:34px; width:auto; margin:0;" />`
    : ''

  return `
  <div style="width:100%; box-sizing:border-box; padding:0 ${PAGE_MARGINS.side} 5mm ${PAGE_MARGINS.side};
              font-family:'Inter','Segoe UI',Arial,sans-serif; color:${COLORS.inkMuted};
              text-align:left; -webkit-print-color-adjust:exact;">
    <div style="border-top:1px solid rgba(31,39,51,0.4); margin-bottom:5px;"></div>
    ${imgHtml}
    <div style="font-size:8px; margin-top:7px;">Liability limited by a scheme approved under Professional Standards Legislation</div>
  </div>`
}

// Wrap a template's rendered body HTML in the full A4 document (head + CSS). The
// header/footer are NOT here — they're the templates above, handed to page.pdf.
// `bodyInnerHtml` is produced by the chosen template version's renderBody().
export function buildEngagementLetterDocument(bodyInnerHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  /* Page size only — the top/bottom/side margins (and thus the header/footer
     bands) are set by the PDF service via page.pdf({ margin }). */
  @page { size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', 'Avenir Next', 'Segoe UI', system-ui, sans-serif;
    color: ${COLORS.ink};
    font-size: 12px;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .letter-body p { margin-bottom: 10px; text-align: justify; }
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
