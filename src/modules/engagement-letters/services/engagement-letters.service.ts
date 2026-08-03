import { db } from '../../../lib/db'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import { engagementLetterMessages } from '../config/engagement-letters.messages'
import { getTemplate, LATEST_VERSION } from '../templates'
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
      const missing = value === undefined || value === null || value === ''
      if (def.required && missing) {
        throw new AppError(engagementLetterMessages.MISSING_REQUIRED_FIELD, HTTP_STATUS.BAD_REQUEST)
      }
      if (def.type === 'date' && !missing) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new AppError(engagementLetterMessages.INVALID_DATE, HTTP_STATUS.BAD_REQUEST)
        }
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
    return { has_letterhead: lh.rows.length > 0, template: this.templateInfo(), addressee }
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

    // Resolve the addressee server-side and FREEZE the snapshot into params (never
    // trust client-sent name/address/email — the relative_id is the source of truth).
    const addressee = await this.resolveAddresseeSnapshot(clientId, input.relative_id)
    const params = { ...(input.params ?? {}), ...addressee }

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
    return generateEngagementLetterPdf(letter.template_version, letter.params ?? {}, letterhead)
  },

  // ── TEMPLATE — the latest template's parameter definitions (for the form) ──
  templateInfo(): EngagementLetterTemplateInfo {
    const tpl = getTemplate(LATEST_VERSION)
    return { version: tpl.version, parameters: tpl.parameters }
  },
}
