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

// The allowed values for the "advice and/or service" choice in Your Responsibilities.
// The chosen value is dropped straight into the sentence, so these ARE the display
// words. Kept here so the service can validate the submitted value against the set.
export const RESPONSIBILITY_TYPES = ['advice', 'service', 'advice and service'] as const

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
    // Engagement Period — the period start and end dates.
    { key: 'engagement_start', label: 'Engagement period start date', type: 'date', required: true },
    { key: 'engagement_end', label: 'Engagement period end date', type: 'date', required: true },
    // Your Responsibilities: the "advice and/or service" choice, and the free-text
    // description of further information/actions required from the client.
    { key: 'responsibility_type', label: 'Advice and/or service', type: 'choice', required: true },
    {
      key: 'further_info',
      label:
        'Describe any further information or actions you require the client to provide or do to enable the timely provision of the engaged services',
      type: 'multiline',
      required: true,
    },
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

    // AML/CTF intro. Pronouns fixed (we are / us / we / our / we); the Act title is
    // italicised (as in the source). Ends with a colon — a list follows.
    const amlIntro = `<p>We are required to comply with the <em>Anti-Money Laundering and Counter-Terrorism Financing Act 2006</em> (AML/CTF Act) and related legislation (AML/CTF Legislation), in connection with any "designated services" (as defined in the AML/CTF Act) that you request from us, or that we provide to you. To comply with our AML/CTF obligations, we may be required to, among other things:</p>`

    // AML/CTF list (a)–(d) — each item is its own paragraph with its literal marker.
    // Pronouns fixed to the "we" forms.
    const amlList = `<p>(a) conduct customer due diligence (CDD), including to verify your identity, and if relevant, the identity of other parties such as beneficial owners or those who may be acting on your behalf. We are also required to collect certain information before we can provide the designated service being requested. These obligations may apply even if you are an existing client.</p>
<p>(b) monitor our clients for suspicious behaviour and transactions;</p>
<p>(c) provide certain information or reports (including suspicious matter reports) to AUSTRAC; and</p>
<p>(d) keep certain records for prescribed time periods.</p>`

    // Closing paragraph after the list. Pronouns fixed (we / our / we).
    const amlClose = `<p>If you do not or if you are unable to provide the information we require in order to comply with our AML/CTF obligations, or if we determine that the designated service requested or provided falls outside our risk appetite, we may suspend or terminate this engagement.</p>`

    // Offence notice — static template text.
    const amlOffence = `<p>Importantly, it is an offence under the AML/CTF Act to seek a designated service under a false name or anonymity, or to provide false or misleading information or documents as part of receiving a designated service.</p>`

    // Section heading — bold, static template text.
    const cdrHeading = `<p style="font-weight:700;">Use of Consumer Data Right Data</p>`

    // CDR paragraph. Pronouns fixed to the "we"/"us" forms. The "<Firm's name>"
    // placeholder is the firm's registered legal firm name, frozen into params at
    // create time (params.firm_name) from the firm master data.
    const firmName = str(params.firm_name)
    const cdr = `<p>We acknowledge that you may consent for an Accredited Data Recipient under the Consumer Data Right (CDR) to disclose your CDR data to us. We confirm that for this purpose you may nominate ${escapeHtml(firmName)} as your Trusted Adviser and that as your trusted adviser, we will only access the data necessary to provide the services in this engagement letter.</p>`

    // Section heading — bold, static template text.
    const respHeading = `<p style="font-weight:700;">Your Responsibilities</p>`

    // Responsibilities paragraph. The "us" pronoun is fixed; the "<advice and/or
    // service>" placeholder is the user's chosen responsibility type (one of
    // RESPONSIBILITY_TYPES), dropped straight into the sentence.
    const respType = str(params.responsibility_type)
    const respIntro = respType
      ? `<p>You acknowledge that you are responsible for ensuring that any information you provide for the engagement is accurate, complete and current, and you will promptly notify us of any changes, as this may affect the ${escapeHtml(respType)} provided.</p>`
      : ''

    // Free-text: further information/actions required from the client (user-entered,
    // required). Its own paragraph; user line breaks are preserved.
    const furtherInfo = str(params.further_info)
    const respFurther = furtherInfo
      ? `<p>${escapeHtml(furtherInfo).replace(/\n/g, '<br/>')}</p>`
      : ''

    // Section heading — bold, static template text.
    const engHeading = `<p style="font-weight:700;">Engagement Period</p>`

    // Engagement period sentence — the two "<date>" placeholders are the period start
    // and end dates. Rendered only when both are present.
    const engStart = formatLetterDate(params.engagement_start)
    const engEnd = formatLetterDate(params.engagement_end)
    const engPeriod =
      engStart && engEnd
        ? `<p>The engagement period commences on ${escapeHtml(engStart)} and will continue until ${escapeHtml(engEnd)}.</p>`
        : ''

    // Section heading — bold, static template text.
    const feesHeading = `<p style="font-weight:700;">Professional Fees and Payments</p>`

    // Fees intro — static template text (more fee content to follow).
    const feesIntro = `<p>All professional fees for the services provided will be based on the time and skill required to complete the tasks, including out of pocket expenses and statutory charges.</p>`

    // Fees lead-in. The "Our" pronoun is fixed. Ends with a colon — more to follow.
    const feesLeadIn = `<p>Our professional fees are (subject to written notification of changes):</p>`

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
${amlHeading}
${amlIntro}
${amlList}
${amlClose}
${amlOffence}
${cdrHeading}
${cdr}
${respHeading}
${respIntro}
${respFurther}
${engHeading}
${engPeriod}
${feesHeading}
${feesIntro}
${feesLeadIn}`
  },
}
