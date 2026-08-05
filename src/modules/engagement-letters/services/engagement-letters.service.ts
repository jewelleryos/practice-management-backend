import { db } from '../../../lib/db'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import { engagementLetterMessages } from '../config/engagement-letters.messages'
import { getTemplate, LATEST_VERSION } from '../templates'
import { RESPONSIBILITY_TYPES, FEE_MODES } from '../templates/v1'
import { generateEngagementLetterPdf } from './engagement-letter-pdf.service'
import type {
  CreateEngagementLetterInput,
  AddEngagementLetterNoteInput,
} from '../config/engagement-letters.schema'
import type {
  EngagementLetterListResponse,
  EngagementLetterDetail,
  EngagementLetterNotesResponse,
  EngagementLetterNote,
  EngagementLetterTemplateInfo,
  EngagementLetterCreateContext,
  EngagementLetterAddressee,
  EngagementLetterAddresseePerson,
  EngagementLetterServices,
  EngagementLetterServiceOption,
  EngagementLetterFirmLegal,
  EngagementLetterSigner,
} from '../types/engagement-letters.types'

// SQL fragment: a member's display name.
const MEMBER_NAME = `TRIM(m.first_name || ' ' || COALESCE(m.last_name, ''))`

// The tax_client columns needed to render an addressee (name + address line + email).
// Parameterised by table alias so the same list serves the client itself and a
// related client, e.g. ADDRESSEE_COLS('oc').
const ADDRESSEE_COLS = (t: string) => `${t}.id, ${t}.name, ${t}.address_line, ${t}.email`

// The client's address for the letter — just the street address line. Suburb /
// state / postcode are intentionally NOT included (the letter shows only the
// address line). Returns '' when blank, so the template drops the line entirely.
function composeAddress(row: { address_line: string | null }): string {
  return (row.address_line ?? '').trim()
}

// Map a tax_client row (selected via ADDRESSEE_COLS) to an addressee person.
function toAddresseePerson(row: any): EngagementLetterAddresseePerson {
  return { id: row.id, name: row.name, address: composeAddress(row), email: row.email ?? null }
}

export const engagementLetterService = {
  // Firms this member can act in: their granted firms in the tax_practice department.
  async accessibleFirmIds(memberId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT mf.firm_id
       FROM member_firms mf
       JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE AND f.department = 'tax_practice'
       WHERE mf.member_id = $1`,
      [memberId],
    )
    return result.rows.map((r) => r.firm_id as string)
  },

  // Load a client (firm-scoped). Throws NOT_FOUND if missing or outside the member's
  // firms (we don't leak existence).
  async assertClientAccessible(actingUser: AuthUser, clientId: string): Promise<{ firm_id: string }> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    const result = await db.query(
      `SELECT id, firm_id FROM tax_clients WHERE id = $1 AND is_deleted = FALSE`,
      [clientId],
    )
    const row = result.rows[0]
    if (!row || !firmIds.includes(row.firm_id)) {
      throw new AppError(engagementLetterMessages.CLIENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return { firm_id: row.firm_id }
  },

  // Load a letter (firm-scoped). Throws NOT_FOUND if missing or outside the member's firms.
  async assertLetterAccessible(actingUser: AuthUser, letterId: string): Promise<any> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    const result = await db.query(
      `SELECT el.id, el.client_id, el.firm_id, el.template_version, el.letterhead_id,
              el.params, el.created_at, el.created_by AS created_by_id, ${MEMBER_NAME} AS created_by_name
       FROM engagement_letters el
       LEFT JOIN members m ON m.id = el.created_by
       WHERE el.id = $1 AND el.is_deleted = FALSE`,
      [letterId],
    )
    const row = result.rows[0]
    if (!row || !firmIds.includes(row.firm_id)) {
      throw new AppError(engagementLetterMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return row
  },

  // ── LIST — a client's letters (newest first) ──
  async list(actingUser: AuthUser, clientId: string): Promise<EngagementLetterListResponse> {
    await this.assertClientAccessible(actingUser, clientId)
    const result = await db.query(
      `SELECT el.id, el.template_version, el.created_at,
              el.created_by AS created_by_id, ${MEMBER_NAME} AS created_by_name
       FROM engagement_letters el
       LEFT JOIN members m ON m.id = el.created_by
       WHERE el.client_id = $1 AND el.is_deleted = FALSE
       ORDER BY el.created_at DESC`,
      [clientId],
    )
    return { items: result.rows }
  },

  // ── DETAIL — one letter ──
  async getById(actingUser: AuthUser, letterId: string): Promise<EngagementLetterDetail> {
    return (await this.assertLetterAccessible(actingUser, letterId)) as EngagementLetterDetail
  },

  // Validate the submitted params against a template version's declared parameters:
  // every required parameter must be present, and each 'date' must be YYYY-MM-DD.
  // (Per-version — v2 may declare a different set.)
  validateParams(version: string, params: Record<string, unknown>): void {
    const { parameters } = getTemplate(version)
    for (const def of parameters) {
      const value = params[def.key]
      // A whitespace-only string counts as missing (a required free-text field must
      // have real content, not just spaces).
      const missing =
        value === undefined ||
        value === null ||
        value === '' ||
        (typeof value === 'string' && value.trim() === '')
      if (def.required && missing) {
        throw new AppError(engagementLetterMessages.MISSING_REQUIRED_FIELD, HTTP_STATUS.BAD_REQUEST)
      }
      if (def.type === 'date' && !missing) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new AppError(engagementLetterMessages.INVALID_DATE, HTTP_STATUS.BAD_REQUEST)
        }
      }
    }

    // Cross-field (v1): the discussion date must be on or before the letter date.
    // Both are YYYY-MM-DD strings, so a plain string comparison is chronological.
    const letterDate = params.letter_date
    const discussionDate = params.discussion_date
    if (
      typeof letterDate === 'string' &&
      typeof discussionDate === 'string' &&
      discussionDate > letterDate
    ) {
      throw new AppError(
        engagementLetterMessages.DISCUSSION_DATE_AFTER_LETTER,
        HTTP_STATUS.BAD_REQUEST,
      )
    }

    // Cross-field (v1): the engagement period must not end before it starts. Both are
    // YYYY-MM-DD strings, so a plain string comparison is chronological.
    const engStart = params.engagement_start
    const engEnd = params.engagement_end
    if (typeof engStart === 'string' && typeof engEnd === 'string' && engEnd < engStart) {
      throw new AppError(
        engagementLetterMessages.ENGAGEMENT_END_BEFORE_START,
        HTTP_STATUS.BAD_REQUEST,
      )
    }

    // Cross-field (v1): the "advice and/or service" choice must be one of the allowed
    // options (the value is dropped straight into the letter, so guard the input).
    const respType = params.responsibility_type
    if (
      typeof respType === 'string' &&
      respType !== '' &&
      !(RESPONSIBILITY_TYPES as readonly string[]).includes(respType)
    ) {
      throw new AppError(
        engagementLetterMessages.INVALID_RESPONSIBILITY_TYPE,
        HTTP_STATUS.BAD_REQUEST,
      )
    }

    // Professional Fees (v1): a fee mode must be chosen, and the detail required by that
    // mode must be present. The fee data lives in params as structured rows (not simple
    // declared parameters), so it's validated here rather than in the required-loop.
    this.validateFees(params)
  },

  // Validate the Professional Fees block for the chosen fee mode. A trimmed-string
  // reader treats whitespace-only as empty; rows are read defensively (params is
  // free-form). Per-mode rules:
  //  - per_hour       → ≥1 row with an employee type AND rate, plus a total estimated fee.
  //  - per_service    → ≥1 row, each carrying a fee amount (one per listed service — the
  //                     frontend supplies a row per selected service).
  //  - lumpsum_yearly → ≥1 row with a financial year AND an amount.
  validateFees(params: Record<string, unknown>): void {
    const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
    const rows = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : []

    const feeMode = params.fee_mode
    if (typeof feeMode !== 'string' || !(FEE_MODES as readonly string[]).includes(feeMode)) {
      throw new AppError(engagementLetterMessages.INVALID_FEE_MODE, HTTP_STATUS.BAD_REQUEST)
    }

    if (feeMode === 'per_hour') {
      const hourly = rows(params.fee_hourly_rows)
      const hasRow = hourly.some((r) => s(r.employee_type) !== '' && s(r.rate) !== '')
      if (!hasRow || s(params.fee_total_estimated) === '') {
        throw new AppError(engagementLetterMessages.FEE_HOURLY_REQUIRED, HTTP_STATUS.BAD_REQUEST)
      }
    } else if (feeMode === 'per_service') {
      const service = rows(params.fee_service_rows)
      const ok = service.length > 0 && service.every((r) => s(r.amount) !== '')
      if (!ok) {
        throw new AppError(engagementLetterMessages.FEE_SERVICE_REQUIRED, HTTP_STATUS.BAD_REQUEST)
      }
    } else {
      // lumpsum_yearly
      const lumpsum = rows(params.fee_lumpsum_rows)
      const hasRow = lumpsum.some((r) => s(r.financial_year) !== '' && s(r.amount) !== '')
      if (!hasRow) {
        throw new AppError(engagementLetterMessages.FEE_LUMPSUM_REQUIRED, HTTP_STATUS.BAD_REQUEST)
      }
    }
  },

  // A client's identity row for the addressee (name + company flag + address + email).
  async clientIdentity(clientId: string): Promise<any> {
    const result = await db.query(
      `SELECT ${ADDRESSEE_COLS('c')}, c.is_company
       FROM tax_clients c
       WHERE c.id = $1 AND c.is_deleted = FALSE`,
      [clientId],
    )
    return result.rows[0]
  },

  // The client's PERSON relations — every related client that is NOT a company
  // (is_company = false), any relation type, in BOTH directions (this client as
  // client_id or as related_client_id), de-duplicated. These are the options a
  // COMPANY client's letter can be addressed to.
  async personRelations(clientId: string): Promise<EngagementLetterAddresseePerson[]> {
    const result = await db.query(
      `SELECT ${ADDRESSEE_COLS('oc')}
       FROM tax_client_relationships r
       JOIN tax_clients oc ON oc.id = r.related_client_id AND oc.is_deleted = FALSE AND oc.is_company = FALSE
       WHERE r.client_id = $1 AND r.is_deleted = FALSE
       UNION
       SELECT ${ADDRESSEE_COLS('oc')}
       FROM tax_client_relationships r
       JOIN tax_clients oc ON oc.id = r.client_id AND oc.is_deleted = FALSE AND oc.is_company = FALSE
       WHERE r.related_client_id = $1 AND r.is_deleted = FALSE
       ORDER BY name`,
      [clientId],
    )
    return result.rows.map(toAddresseePerson)
  },

  // Build the addressee block for the create screen (see EngagementLetterAddressee).
  async buildAddressee(clientId: string): Promise<EngagementLetterAddressee> {
    const client = await this.clientIdentity(clientId)
    if (client?.is_company) {
      const relation_options = await this.personRelations(clientId)
      return { is_company: true, self: null, relation_options, needs_relation: relation_options.length === 0 }
    }
    // Person client → addresses itself; no relations to choose from.
    return {
      is_company: false,
      self: client ? toAddresseePerson(client) : null,
      relation_options: [],
      needs_relation: false,
    }
  },

  // Resolve WHOSE details to freeze onto the letter, and return the snapshot params.
  // Person client → the client itself (relative_id null). Company client → the
  // chosen PERSON relation (relative_id required and validated firm-scoped).
  async resolveAddresseeSnapshot(clientId: string, relativeId: string | null | undefined) {
    const client = await this.clientIdentity(clientId)
    let person: EngagementLetterAddresseePerson
    let relative_id: string | null = null

    if (client?.is_company) {
      if (!relativeId) {
        throw new AppError(engagementLetterMessages.RELATIVE_REQUIRED, HTTP_STATUS.BAD_REQUEST)
      }
      const options = await this.personRelations(clientId)
      const match = options.find((o) => o.id === relativeId)
      if (!match) {
        throw new AppError(engagementLetterMessages.INVALID_RELATIVE, HTTP_STATUS.BAD_REQUEST)
      }
      person = match
      relative_id = relativeId
    } else {
      // Person client addresses itself; any submitted relative_id is ignored.
      person = toAddresseePerson(client)
    }

    return {
      relative_id,
      client_name: person.name,
      client_address: person.address,
      client_email: person.email,
      // Frozen so the signature block's "Acknowledged for and on behalf of <entity>"
      // line renders for company clients only.
      is_company: !!client?.is_company,
    }
  },

  // ── SIGNER (firm concern person) ──
  // The firm's concern persons for the "Signed by" dropdown (id + name + designation
  // + whether they have a signature). The signature image itself is never returned.
  async firmSigners(firmId: string): Promise<EngagementLetterSigner[]> {
    const result = await db.query(`SELECT concern_persons FROM firms WHERE id = $1`, [firmId])
    const persons = (result.rows[0]?.concern_persons ?? []) as Array<{
      id?: string
      name?: string
      designation?: string | null
      signature_uploaded?: boolean
    }>
    return persons
      .filter((p) => p.id)
      .map((p) => ({
        id: p.id as string,
        name: p.name ?? '',
        designation: p.designation ?? null,
        signature_uploaded: !!p.signature_uploaded,
      }))
  },

  // Resolve the chosen signer → freeze their name/designation and their ACTIVE
  // signature id. Rejects if no signer chosen, the id isn't a concern person of this
  // firm, or that person has no signature. The signature image is looked up by the
  // frozen id at render time (the row is append-only, so the id always resolves).
  async resolveSignerSnapshot(firmId: string, concernPersonId: string | null | undefined) {
    if (!concernPersonId) {
      throw new AppError(engagementLetterMessages.SIGNER_REQUIRED, HTTP_STATUS.BAD_REQUEST)
    }
    const signer = (await this.firmSigners(firmId)).find((s) => s.id === concernPersonId)
    if (!signer) {
      throw new AppError(engagementLetterMessages.SIGNER_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
    const sig = await db.query(
      `SELECT id FROM concern_person_signatures
       WHERE concern_person_id = $1 AND is_active = TRUE AND is_deleted = FALSE`,
      [concernPersonId],
    )
    const signatureId = sig.rows[0]?.id as string | undefined
    if (!signer.signature_uploaded || !signatureId) {
      throw new AppError(engagementLetterMessages.SIGNER_SIGNATURE_REQUIRED, HTTP_STATUS.BAD_REQUEST)
    }
    return {
      signer_name: signer.name,
      signer_designation: signer.designation ?? '',
      signer_signature_id: signatureId,
    }
  },

  // ── SERVICES (letter-only) ──
  // Every ACTIVE tax-practice service (id + name), alphabetical — the checkbox list.
  // Services are department-level master data (no firm scoping).
  async taxServiceOptions(): Promise<EngagementLetterServiceOption[]> {
    const result = await db.query(
      `SELECT id, name FROM services
       WHERE department = 'tax_practice' AND is_deleted = FALSE
       ORDER BY name`,
    )
    return result.rows as EngagementLetterServiceOption[]
  },

  // The active tax-practice services this client currently uses — the ids that start
  // ticked on the form. Read-only: we never write tax_client_services from here.
  async clientServiceIds(clientId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT DISTINCT s.id
       FROM tax_client_services tcs
       JOIN services s ON s.id = tcs.service_id
         AND s.is_deleted = FALSE AND s.department = 'tax_practice'
       WHERE tcs.client_id = $1 AND tcs.is_deleted = FALSE`,
      [clientId],
    )
    return result.rows.map((r) => r.id as string)
  },

  // The services block for the create screen (all services + client's current ids).
  async buildServices(clientId: string): Promise<EngagementLetterServices> {
    const [all, default_ids] = await Promise.all([
      this.taxServiceOptions(),
      this.clientServiceIds(clientId),
    ])
    return { all, default_ids }
  },

  // Resolve the chosen services → their NAME (active tax-practice only) paired with
  // the user's OPTIONAL description, sorted alphabetically by name, to FREEZE into the
  // letter. At least one valid service is required (invalid/deleted/foreign ids are
  // dropped; if nothing valid remains, we reject). The service `id` is frozen too, so
  // per-service fee rows (fee_service_rows[].service_id) can join to it at render time.
  async resolveServicesSnapshot(
    selections: { id: string; description?: string }[] | undefined,
  ): Promise<{ id: string; name: string; description: string }[]> {
    const list = Array.isArray(selections) ? selections : []
    if (list.length === 0) {
      throw new AppError(engagementLetterMessages.SERVICES_REQUIRED, HTTP_STATUS.BAD_REQUEST)
    }
    const result = await db.query(
      `SELECT id, name FROM services
       WHERE id = ANY($1::text[]) AND department = 'tax_practice' AND is_deleted = FALSE`,
      [list.map((s) => s.id)],
    )
    const nameById = new Map(result.rows.map((r) => [r.id as string, r.name as string]))
    const resolved = list
      .filter((s) => nameById.has(s.id))
      .map((s) => ({ id: s.id, name: nameById.get(s.id) as string, description: (s.description ?? '').trim() }))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (resolved.length === 0) {
      throw new AppError(engagementLetterMessages.SERVICES_REQUIRED, HTTP_STATUS.BAD_REQUEST)
    }
    return resolved
  },

  // The firm's registered legal names — shown (read-only) on the create screen and
  // later frozen into the letter. A field may be null for firms created before the
  // legal-details fields existed.
  async firmLegalDetails(firmId: string): Promise<EngagementLetterFirmLegal> {
    const result = await db.query(
      `SELECT legal_company_name, legal_trust_name, legal_firm_name, email, contact_no
       FROM firms WHERE id = $1`,
      [firmId],
    )
    const row = result.rows[0]
    return {
      legal_company_name: row?.legal_company_name ?? null,
      legal_trust_name: row?.legal_trust_name ?? null,
      legal_firm_name: row?.legal_firm_name ?? null,
      email: row?.email ?? null,
      contact_no: row?.contact_no ?? null,
    }
  },

  // ── CREATE-CONTEXT — what the create screen needs before showing the form ──
  // Whether the client's firm has a letter head (else the UI shows "not configured
  // yet — create the letter head first"), the active template's version + parameter
  // defs, and the addressee block (client name / address / email + relation choices).
  // Firm-scoped like everything else; no letterhead permission needed (governed by
  // MANAGE_ENGAGEMENT_LETTERS).
  async createContext(actingUser: AuthUser, clientId: string): Promise<EngagementLetterCreateContext> {
    const { firm_id } = await this.assertClientAccessible(actingUser, clientId)
    const lh = await db.query(
      `SELECT 1 FROM firm_letterheads WHERE firm_id = $1 AND is_latest = TRUE`,
      [firm_id],
    )
    const addressee = await this.buildAddressee(clientId)
    const services = await this.buildServices(clientId)
    const firm = await this.firmLegalDetails(firm_id)
    const signers = await this.firmSigners(firm_id)
    return {
      has_letterhead: lh.rows.length > 0,
      template: this.templateInfo(),
      addressee,
      services,
      firm,
      signers,
    }
  },

  // ── CREATE — a new letter for a client ──
  // Template + letter-head versions are decided by the system: the latest template
  // and the firm's latest letter head. The letter is immutable once created.
  async create(
    actingUser: AuthUser,
    clientId: string,
    input: CreateEngagementLetterInput,
  ): Promise<EngagementLetterDetail> {
    const { firm_id } = await this.assertClientAccessible(actingUser, clientId)

    // Reject bad/missing params up front (per the latest template's field set).
    this.validateParams(LATEST_VERSION, input.params ?? {})

    // Resolve the addressee + services server-side and FREEZE the snapshots into
    // params (never trust client-sent names — ids are the source of truth). The
    // addressee is derived from relative_id; `services` is the list of chosen service
    // NAMES (active tax-practice), frozen as text so the letter never drifts.
    const addressee = await this.resolveAddresseeSnapshot(clientId, input.relative_id)
    const services = await this.resolveServicesSnapshot(input.services)
    // The firm's registered legal names fill the letter's firm placeholders — the legal
    // firm name in the CDR section, and all three (company / trustee / firm) in the
    // Costs of Recovery clause. Resolved server-side from firm_id and frozen, so the
    // letter never drifts if the firm later edits its legal names.
    const firm = await this.firmLegalDetails(firm_id)
    // The firm's contact number and email are printed in the Privacy section — both are
    // mandatory. Refuse to generate until the firm has them (mirrors the letterhead gate).
    if (!firm.email || !firm.contact_no) {
      throw new AppError(engagementLetterMessages.FIRM_CONTACT_REQUIRED, HTTP_STATUS.BAD_REQUEST)
    }
    // The signer (a firm concern person) is resolved + frozen: name, designation, and
    // their ACTIVE signature id. Rejects if the chosen person has no signature.
    const signer = await this.resolveSignerSnapshot(firm_id, input.signer_concern_person_id)
    const params = {
      ...(input.params ?? {}),
      ...addressee,
      services,
      company_name: firm.legal_company_name ?? '',
      trust_name: firm.legal_trust_name ?? '',
      firm_name: firm.legal_firm_name ?? '',
      firm_email: firm.email,
      firm_contact_no: firm.contact_no,
      ...signer,
    }

    // The firm's current letter head (header/footer) is pinned to the letter.
    const lh = await db.query(
      `SELECT id FROM firm_letterheads WHERE firm_id = $1 AND is_latest = TRUE`,
      [firm_id],
    )
    const letterheadId = lh.rows[0]?.id
    if (!letterheadId) {
      throw new AppError(engagementLetterMessages.NO_LETTERHEAD, HTTP_STATUS.BAD_REQUEST)
    }

    const inserted = await db.query(
      `INSERT INTO engagement_letters (client_id, firm_id, template_version, letterhead_id, params, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id`,
      [clientId, firm_id, LATEST_VERSION, letterheadId, JSON.stringify(params), actingUser.id],
    )
    return this.getById(actingUser, inserted.rows[0].id)
  },

  // ── NOTES — list (newest first) ──
  async listNotes(actingUser: AuthUser, letterId: string): Promise<EngagementLetterNotesResponse> {
    await this.assertLetterAccessible(actingUser, letterId)
    const result = await db.query(
      `SELECT n.id, n.body, n.created_at,
              n.created_by AS created_by_id, ${MEMBER_NAME} AS created_by_name
       FROM engagement_letter_notes n
       LEFT JOIN members m ON m.id = n.created_by
       WHERE n.engagement_letter_id = $1 AND n.is_deleted = FALSE
       ORDER BY n.created_at DESC`,
      [letterId],
    )
    return { items: result.rows }
  },

  // ── NOTES — add (append-only) ──
  async addNote(
    actingUser: AuthUser,
    letterId: string,
    input: AddEngagementLetterNoteInput,
  ): Promise<EngagementLetterNote> {
    await this.assertLetterAccessible(actingUser, letterId)
    const inserted = await db.query(
      `INSERT INTO engagement_letter_notes (engagement_letter_id, body, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [letterId, input.body, actingUser.id],
    )
    const result = await db.query(
      `SELECT n.id, n.body, n.created_at,
              n.created_by AS created_by_id, ${MEMBER_NAME} AS created_by_name
       FROM engagement_letter_notes n
       LEFT JOIN members m ON m.id = n.created_by
       WHERE n.id = $1`,
      [inserted.rows[0].id],
    )
    return result.rows[0] as EngagementLetterNote
  },

  // ── PDF — regenerate on the fly from the pinned version + params + letter head ──
  async generatePdf(actingUser: AuthUser, letterId: string): Promise<Uint8Array> {
    const letter = await this.assertLetterAccessible(actingUser, letterId)
    // Load the exact letter-head version pinned to this letter, directly (no
    // letterhead-permission gate — access is already governed by
    // MANAGE_ENGAGEMENT_LETTERS). Letter heads are permanent, so the row exists;
    // if it somehow doesn't, fall through to the PDF service's sample fallback.
    const lh = await db.query(
      `SELECT content FROM firm_letterheads WHERE id = $1`,
      [letter.letterhead_id],
    )
    const letterhead = lh.rows[0]?.content ?? undefined

    // Resolve the frozen signer signature (by id) into the base64 image the template
    // draws. Kept out of the stored params (lean, immutable) — looked up per render;
    // the row is append-only so the id always resolves, even after the signer changes
    // their signature. renderBody stays pure: it just reads params.signer_signature.
    const params = { ...(letter.params ?? {}) } as Record<string, unknown>
    const signatureId = params.signer_signature_id
    if (typeof signatureId === 'string' && signatureId) {
      const sig = await db.query(
        `SELECT image_base64 FROM concern_person_signatures WHERE id = $1`,
        [signatureId],
      )
      params.signer_signature = sig.rows[0]?.image_base64 ?? ''
    }
    return generateEngagementLetterPdf(letter.template_version, params, letterhead)
  },

  // ── TEMPLATE — the latest template's parameter definitions (for the form) ──
  templateInfo(): EngagementLetterTemplateInfo {
    const tpl = getTemplate(LATEST_VERSION)
    return { version: tpl.version, parameters: tpl.parameters }
  },
}
