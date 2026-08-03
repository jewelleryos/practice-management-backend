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

    // The chosen services — frozen as { name, description }, printed as a bulleted
    // list (name, then the optional description on the line below). Stored pre-sorted
    // (alphabetical) by the service; blanks are skipped defensively. A plain-string
    // entry is tolerated (older shape) as a name with no description.
    const serviceItems = (Array.isArray(params.services) ? params.services : [])
      .map((s) => {
        if (typeof s === 'string') return { name: s.trim(), description: '' }
        if (s && typeof s === 'object') {
          const rec = s as Record<string, unknown>
          const name = typeof rec.name === 'string' ? rec.name.trim() : ''
          const description = typeof rec.description === 'string' ? rec.description.trim() : ''
          return { name, description }
        }
        return { name: '', description: '' }
      })
      .filter((s) => s.name !== '')
    const servicesList = serviceItems.length
      ? `<ul style="margin:0 0 13px 22px;padding:0;">${serviceItems
          .map((s) => {
            const desc = s.description
              ? `<br/><span style="color:#5b6573;">${escapeHtml(s.description)}</span>`
              : ''
            return `<li style="margin-bottom:6px;">${escapeHtml(s.name)}${desc}</li>`
          })
          .join('')}</ul>`
      : ''

    // Assurance disclaimer after the services list. The "we" pronoun is fixed.
    const noAssurance = `<p>Please be aware that we will not conduct an audit or review as a service to be performed for you and accordingly, no assurance will be expressed.</p>`

    // Irregularities disclaimer. The "we"/"our" pronouns are fixed.
    const irregularities = `<p>Unless specified above as a service to be performed for you, this engagement cannot be relied upon to disclose irregularities including fraud, other illegal acts and errors that may occur. However, we will inform you of such matters if they come to our attention.</p>`

    // Professional/ethical standards statement. The "we" pronoun is fixed; the code's
    // title is italicised (as in the source), "APES 110" stays upright.
    const ethicalStandards = `<p>We will perform Services in accordance with professional and ethical. These standards require that, in undertaking this engagement, we comply with the relevant ethical requirements of APES 110 <em>Code of Ethics for Professional Accountants (including Independence Standards)</em>.</p>`

    // NOCLAR statement. The "we are" pronoun is fixed.
    const noclar = `<p>Pursuant to the Responding to Non-Compliance with Laws and Regulations (NOCLAR) requirements of APES 110, we are required to report any material, actual or potential non-compliance with laws and regulations or acts of omission or commission, intentional or unintentional by a client or by those charged with governance, by management or by other individuals working for or under the direction of a client which are contrary to the prevailing laws or regulations.</p>`

    // Section heading — bold, static template text.
    const amlHeading = `<p style="font-weight:700;">Anti-Money Laundering and Counter-Terrorism Financing (AML/CTF) Obligations</p>`

    return `<p style="text-align:left;">${escapeHtml(dateHtml)}</p>
${renderAddressee(params)}
${salutation}
${terms}
${intro}
${objective}
${servicesIntro}
${servicesList}
${noAssurance}
${irregularities}
${ethicalStandards}
${noclar}
${amlHeading}`
  },
}
