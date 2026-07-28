// HTML template for the letter-head PDF. Kept out of the PDF service so the markup/CSS
// lives on its own. Produces a self-contained A4 HTML document that mirrors the on-screen
// preview (LetterheadHeaderPreview / LetterheadFooterPreview): header pinned to the top
// with a closing rule, footer pinned to the bottom, empty space between (what the user
// prints and writes on).
import { authConfig } from '../../../config/auth.config'
import type { LetterheadContent } from '../types/firms.types'

// Design tokens copied from the frontend Tailwind config so the PDF matches the
// preview exactly (final-frontend/tailwind.config.ts).
const COLORS = {
  navy: '#0A1F44',
  ink: '#1f2733',
  inkMuted: '#5b6573',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Build the full A4 HTML document for a blank letterhead.
export function buildBlankLetterheadHtml(content: LetterheadContent): string {
  const header = content.header
  const top = header.top_row ?? { left: null, middle: null, right: null }
  const hasTopRow = !!(top.left || top.middle || top.right)
  const lines = (header.lines ?? []).filter((l) => l.trim() !== '')

  // Footer image: resolve the catalog path (added on read) to an absolute URL on the
  // frontend origin. Null if the referenced image was removed from the catalog.
  const imagePath = content.footer?.image_path ?? null
  const footerSrc = imagePath ? `${authConfig.frontendUrl}${imagePath}` : null

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

  const footerHtml = footerSrc
    ? `<img src="${escapeHtml(footerSrc)}" alt="Letter head footer" class="footer-img" />`
    : `<p class="footer-missing">Footer image unavailable.</p>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 210mm; }
  body {
    font-family: 'Inter', 'Avenir Next', 'Segoe UI', system-ui, sans-serif;
    color: ${COLORS.ink};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    display: flex;
    flex-direction: column;
    /* Tight page margins so the letterhead uses the full width of the A4 sheet. */
    padding: 2mm 4mm;
  }
  /* Full-width rule marking the end of the header block. */
  .header-rule {
    border-top: 1px solid rgba(31, 39, 51, 0.7);
    margin-top: 10px;
  }
  .spacer { flex: 1 1 auto; }

  /* Header — mirrors LetterheadHeaderPreview */
  .top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid rgba(31, 39, 51, 0.7);
    padding-bottom: 4px;
    font-size: 11px;
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
    line-height: 1.1;
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
    line-height: 24px;
    color: ${COLORS.ink};
  }

  /* Footer — mirrors LetterheadFooterPreview (full-width strip, left-aligned image) */
  .footer {
    border-top: 1px solid rgba(31, 39, 51, 0.4);
    padding-top: 12px;
  }
  .footer-img { display: block; height: auto; max-height: 64px; width: auto; }
  .footer-missing { font-size: 13px; color: ${COLORS.inkMuted}; padding: 8px 0; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${topRowHtml}
      <div class="company">${escapeHtml(header.company_name || '')}</div>
      ${linesHtml}
    </div>
    <div class="header-rule"></div>
    <div class="spacer"></div>
    <div class="footer">${footerHtml}</div>
  </div>
</body>
</html>`
}
