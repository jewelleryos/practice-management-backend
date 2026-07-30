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
} from '../types/engagement-letters.types'

// SQL fragment: a member's display name.
const MEMBER_NAME = `TRIM(m.first_name || ' ' || COALESCE(m.last_name, ''))`

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

  // ── CREATE-CONTEXT — what the create screen needs before showing the form ──
  // Whether the client's firm has a letter head (else the UI shows "not configured
  // yet — create the letter head first"), plus the active template's version +
  // parameter defs. Firm-scoped like everything else; no letterhead permission
  // needed (governed by MANAGE_ENGAGEMENT_LETTERS).
  async createContext(actingUser: AuthUser, clientId: string): Promise<EngagementLetterCreateContext> {
    const { firm_id } = await this.assertClientAccessible(actingUser, clientId)
    const lh = await db.query(
      `SELECT 1 FROM firm_letterheads WHERE firm_id = $1 AND is_latest = TRUE`,
      [firm_id],
    )
    return { has_letterhead: lh.rows.length > 0, template: this.templateInfo() }
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
      [clientId, firm_id, LATEST_VERSION, letterheadId, JSON.stringify(input.params ?? {}), actingUser.id],
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
