// Engagement letter — template version v1.
//
// Building the body from scratch. Real content gets added section by section, and
// parameters one at a time. Once real letters are pinned to 'v1', this file must
// NOT be edited in a breaking way — a bigger change becomes v2.
//
// So far: the letter date, then the addressee block (client name / address /
// email). The addressee values are FROZEN into params at create time by the
// service (resolveAddresseeSnapshot) — the person client itself, or a company
// client's chosen person relation — so here we only read + render them. They are
// not user-entered form fields, so they are NOT declared in `parameters`.
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

// A frozen param → trimmed string ('' when missing).
function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// The addressee block: client name, then each address line, then email — one per
// line. Empty pieces are dropped so there are no blank lines. The stored address
// is '\n'-separated (composed by the service); each line is escaped separately.
function renderAddressee(params: Record<string, unknown>): string {
  const address = str(params.client_address)
  const lines = [
    str(params.client_name),
    ...address.split('\n').map((l) => l.trim()),
    str(params.client_email),
  ].filter(Boolean)
  if (!lines.length) return ''
  return `<p style="text-align:left;">${lines.map(escapeHtml).join('<br/>')}</p>`
}

export const templateV1: EngagementLetterTemplate = {
  version: 'v1',

  // User-entered form fields only. The addressee (name/address/email) is derived
  // server-side from the client / chosen relation, so it is not listed here.
  // discussion_date is the date of the discussions the letter follows up on; it
  // defaults to the letter date and must be on or before it (enforced in the
  // service's validateParams).
  parameters: [
    { key: 'letter_date', label: 'Date', type: 'date', required: true },
    { key: 'discussion_date', label: 'Discussion date', type: 'date', required: true },
  ],

  renderBody(params) {
    const dateHtml = formatLetterDate(params.letter_date)

    // Salutation — the SAME resolved client name used in the addressee block above.
    const clientName = str(params.client_name)
    const salutation = clientName
      ? `<p style="text-align:left;">Dear ${escapeHtml(clientName)}</p>`
      : ''

    // Subject line — the ENTITY name (the client's own name: the company name for a
    // company, the person's name for a person), sent from the form as `entity_name`.
    // Rendered slightly bold.
    const entityName = str(params.entity_name)
    const terms = entityName
      ? `<p style="text-align:left;font-weight:600;">Terms of Engagement for ${escapeHtml(entityName)}</p>`
      : ''

    // Opening block. Both sentences live in ONE paragraph, separated by a line break
    // (not a paragraph gap) so they sit on consecutive lines like the source letter.
    // The "we are" pronoun is fixed (the firm always writes as "we"); the discussion
    // date is a separate calendar value from the letter date.
    const discussionHtml = formatLetterDate(params.discussion_date)
    const line1 = discussionHtml
      ? `Further to our discussions on ${escapeHtml(discussionHtml)}, we are pleased to accept your appointment to Following Services.`
      : ''
    const line2 = `This document sets out our terms of engagement. Any changes must be mutually agreed and confirmed in writing.`
    const intro = `<p>${[line1, line2].filter(Boolean).join('<br/>')}</p>`

    // Section heading — bold, static template text.
    const objective = `<p style="font-weight:700;">Objective and Scope of Services</p>`

    // Lead-in to the services list. The "we" pronoun is fixed (firm writes as "we").
    const servicesIntro = `<p>You have requested that we provide the following services:</p>`

    return `<p style="text-align:left;">${escapeHtml(dateHtml)}</p>
${renderAddressee(params)}
${salutation}
${terms}
${intro}
${objective}
${servicesIntro}`
  },
}
