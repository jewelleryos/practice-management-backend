// Engagement letter — template version v1.
//
// Building the body from scratch. Right now it renders ONLY the letter date; real
// content gets added section by section, and parameters one at a time. Once real
// letters are pinned to 'v1', this file must NOT be edited in a breaking way — a
// bigger change becomes v2.
import { escapeHtml } from '../helpers/engagement-letter-html.helper'
import type { EngagementLetterTemplate } from './types'

// Format a stored calendar date ('YYYY-MM-DD') as DD/MM/YYYY from its string parts.
// No `new Date()` — that would shift the day by the server's timezone; the date is
// a calendar value the user picked, so we reformat the digits directly.
function formatLetterDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

export const templateV1: EngagementLetterTemplate = {
  version: 'v1',

  // Parameters grow one at a time as we build the real letter. First: the date.
  parameters: [{ key: 'letter_date', label: 'Date', type: 'date', required: true }],

  renderBody(params) {
    const dateHtml = formatLetterDate(params.letter_date)

    return `<p style="text-align:left;">${escapeHtml(dateHtml)}</p>`
  },
}
