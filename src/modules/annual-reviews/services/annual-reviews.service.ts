import { db } from '../../../lib/db'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { annualReviewMessages } from '../config/annual-reviews.messages'
import {
  ANNUAL_REVIEW_STATUSES,
  type AnnualReviewStatus,
  type AnnualReviewDueFilter,
} from '../../../config/annual-review-statuses.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import type {
  AnnualReviewListItem,
  AnnualReviewListResponse,
  ListAnnualReviewsQuery,
  MissingDateClient,
  UpdateAnnualReviewRequest,
} from '../types/annual-reviews.types'

// The eligibility rule, written once. A client is due an annual review when their
// entity type has the toggle on, they are active and not deleted. The incorporation
// date is NOT part of this fragment on purpose: generation adds
// "AND dob_or_incorporation_date IS NOT NULL", while listMissingDate() adds
// "IS NULL", so the two can never drift apart.
const ELIGIBLE_CLIENT_SQL = `
  FROM tax_clients c
  JOIN entity_types et ON et.id = c.entity_type_id
  WHERE c.is_deleted = FALSE
    AND c.status = 'active'
    AND et.is_deleted = FALSE
    AND et.annual_review_enabled = TRUE
`

// "Today" as a plain calendar date in the firm's timezone. review_date is a DATE
// (no timezone), so it must be compared against a DATE derived the same way the
// current year is - a naive CURRENT_DATE would be the server's UTC day and would be
// wrong for up to 11 hours every day.
const TODAY_SQL = `(NOW() AT TIME ZONE 'Australia/Sydney')::date`

// Due-date windows. Each is a WHERE fragment relative to TODAY_SQL.
//
// `overdue` deliberately excludes 'done': a review that is finished is not late,
// however long ago its date passed. That makes Overdue an actionable worklist
// rather than a historical record.
const DUE_FILTER_SQL: Record<AnnualReviewDueFilter, string> = {
  overdue: `ar.review_date < ${TODAY_SQL} AND ar.status <> 'done'`,
  today: `ar.review_date = ${TODAY_SQL}`,
  // Postgres weeks start Monday, which matches an Australian business week.
  this_week: `ar.review_date >= date_trunc('week', ${TODAY_SQL})::date
              AND ar.review_date < (date_trunc('week', ${TODAY_SQL}) + INTERVAL '7 days')::date`,
  this_month: `ar.review_date >= date_trunc('month', ${TODAY_SQL})::date
               AND ar.review_date < (date_trunc('month', ${TODAY_SQL}) + INTERVAL '1 month')::date`,
  next_30_days: `ar.review_date >= ${TODAY_SQL}
                 AND ar.review_date <= (${TODAY_SQL} + INTERVAL '30 days')::date`,
}

// The columns every read of a review row returns, so the list and the update
// response are always the same shape.
const ROW_SELECT = `
  SELECT ar.id,
         ar.client_id,
         c.name                      AS client_name,
         et.name                     AS entity_type_name,
         c.dob_or_incorporation_date AS incorporation_date,
         ar.year,
         ar.review_date,
         ar.status,
         ar.notes
  FROM annual_reviews ar
  JOIN tax_clients c        ON c.id = ar.client_id
  LEFT JOIN entity_types et ON et.id = c.entity_type_id
`

export const annualReviewService = {
  // Firms this member can see clients for: their granted firms that belong to the
  // Tax Practice department. Visibility everywhere is scoped to this set.
  //
  // This mirrors taxClientService.accessibleFirmIds rather than calling it, on
  // purpose: tax-clients.service imports THIS module (to sync a client's review on
  // create/update), so importing it back would form a cycle. Six lines of duplicated
  // SQL is a better trade than a circular import in a live app.
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

  // The current calendar year in the firm's timezone. Computed in SQL so there is
  // exactly one source of truth: on 1 January Sydney rolls over about 11 hours
  // before UTC does, and a UTC-based check would report last year for half a day.
  async currentYear(): Promise<number> {
    const result = await db.query(
      `SELECT EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Australia/Sydney'))::INT AS year`,
    )
    return result.rows[0].year as number
  },

  // Insert a row for every eligible client that does not already have one for this
  // year, then record the sweep in the ledger.
  //
  // Idempotent: ON CONFLICT against idx_annual_reviews_client_year means running
  // this a hundred times produces the same result as running it once. That property
  // is what lets it be called from the scheduler, the client hooks and the page load
  // without any coordination between them.
  //
  // Returns how many rows were newly inserted.
  async ensureAnnualReviews(year: number): Promise<number> {
    const inserted = await db.query(
      `INSERT INTO annual_reviews (client_id, year, review_date)
       SELECT c.id, $1, annual_review_date(c.dob_or_incorporation_date, $1)
       ${ELIGIBLE_CLIENT_SQL}
         AND c.dob_or_incorporation_date IS NOT NULL
       ON CONFLICT (client_id, year) DO NOTHING
       RETURNING id`,
      [year],
    )

    const total = await db.query(
      `SELECT COUNT(*)::INT AS n FROM annual_reviews WHERE year = $1 AND is_deleted = FALSE`,
      [year],
    )

    await db.query(
      `INSERT INTO annual_review_years (year, client_count)
       VALUES ($1, $2)
       ON CONFLICT (year) DO UPDATE
         SET last_swept_at = NOW(), client_count = EXCLUDED.client_count`,
      [year, total.rows[0].n],
    )

    return inserted.rowCount ?? 0
  },

  // Page-load safety net. Generates only when the current year has never been swept,
  // so for the rest of the year the cost is one primary-key lookup per request.
  //
  // This is what makes 1 January correct even if the server happened to be down when
  // the weekly sweep was due. Returns the current year either way.
  async ensureCurrentYearOnce(): Promise<number> {
    const year = await this.currentYear()
    const seen = await db.query(`SELECT 1 FROM annual_review_years WHERE year = $1`, [year])
    if (seen.rows.length === 0) {
      await this.ensureAnnualReviews(year)
    }
    return year
  },

  // Called after a client is created or edited, so their row appears immediately
  // rather than waiting for Sunday.
  //
  // Also corrects the stored review_date for the current year onward if the client's
  // incorporation date was fixed. Past years deliberately keep the date they were
  // generated with — an annual review is a record of what was done that year.
  async syncClient(clientId: string): Promise<void> {
    const year = await this.currentYear()

    await db.query(
      `INSERT INTO annual_reviews (client_id, year, review_date)
       SELECT c.id, $1, annual_review_date(c.dob_or_incorporation_date, $1)
       ${ELIGIBLE_CLIENT_SQL}
         AND c.dob_or_incorporation_date IS NOT NULL
         AND c.id = $2
       ON CONFLICT (client_id, year) DO NOTHING`,
      [year, clientId],
    )

    await db.query(
      `UPDATE annual_reviews ar
       SET review_date = annual_review_date(c.dob_or_incorporation_date, ar.year)
       FROM tax_clients c
       WHERE c.id = ar.client_id
         AND ar.client_id = $1
         AND ar.year >= $2
         AND c.dob_or_incorporation_date IS NOT NULL
         AND ar.review_date <> annual_review_date(c.dob_or_incorporation_date, ar.year)`,
      [clientId, year],
    )
  },

  // ── LIST (firm-scoped, filtered, paginated) ──
  async list(actingUser: AuthUser, q: ListAnnualReviewsQuery): Promise<AnnualReviewListResponse> {
    // No explicit year means "this year", and this is also the safety net that
    // generates a brand new year on its first page load.
    const year = q.year ?? (await this.ensureCurrentYearOnce())

    // Visibility boundary: the same firm scope every other tax module uses.
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: q.page,
        pageSize: q.pageSize,
        totalPages: 0,
        year,
        years: [],
        statusCounts: { pending: 0, sent_to_client: 0, done: 0 },
        overdueCount: 0,
        missingDateCount: 0,
      }
    }

    const where: string[] = [
      'ar.is_deleted = FALSE',
      'c.is_deleted = FALSE',
      'ar.year = $1',
      'c.firm_id = ANY($2)',
    ]
    const values: any[] = [year, firmIds]
    let i = 3

    if (q.status) {
      where.push(`ar.status = $${i++}`)
      values.push(q.status)
    }
    // Due window. The fragment is an internal literal keyed by a Zod-validated
    // enum, never user input, so it cannot carry injection.
    if (q.due) {
      where.push(`(${DUE_FILTER_SQL[q.due]})`)
    }
    if (q.firmId) {
      where.push(`c.firm_id = $${i++}`)
      values.push(q.firmId)
    }
    if (q.search) {
      where.push(`LOWER(c.name) LIKE LOWER($${i++})`)
      values.push(`%${q.search}%`)
    }
    const whereSql = where.join(' AND ')

    const countResult = await db.query(
      `SELECT COUNT(*)::INT AS n
       FROM annual_reviews ar
       JOIN tax_clients c ON c.id = ar.client_id
       WHERE ${whereSql}`,
      values,
    )
    const total = countResult.rows[0].n as number

    const rowsResult = await db.query(
      `${ROW_SELECT}
       WHERE ${whereSql}
       ORDER BY ar.review_date ASC, c.name ASC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    )

    // Status counts cover the WHOLE year, not the filtered page, so the numbers in
    // the status filter stay stable while someone narrows the list.
    const countsResult = await db.query(
      `SELECT ar.status, COUNT(*)::INT AS n
       FROM annual_reviews ar
       JOIN tax_clients c ON c.id = ar.client_id
       WHERE ar.is_deleted = FALSE AND c.is_deleted = FALSE
         AND ar.year = $1 AND c.firm_id = ANY($2)
       GROUP BY ar.status`,
      [year, firmIds],
    )
    const statusCounts: Record<AnnualReviewStatus, number> = {
      pending: 0,
      sent_to_client: 0,
      done: 0,
    }
    for (const row of countsResult.rows) {
      if ((ANNUAL_REVIEW_STATUSES as readonly string[]).includes(row.status)) {
        statusCounts[row.status as AnnualReviewStatus] = row.n as number
      }
    }

    // Every year that has rows, so past years stay reachable from the filter and
    // unfinished work is never lost on 1 January.
    const yearsResult = await db.query(
      `SELECT DISTINCT ar.year
       FROM annual_reviews ar
       JOIN tax_clients c ON c.id = ar.client_id
       WHERE ar.is_deleted = FALSE AND c.is_deleted = FALSE AND c.firm_id = ANY($1)
       ORDER BY ar.year DESC`,
      [firmIds],
    )

    // How many reviews in this year are past their date and still not done. Counted
    // for the whole year rather than the filtered page, so the warning strip does
    // not change as someone narrows the list.
    const overdueResult = await db.query(
      `SELECT COUNT(*)::INT AS n
       FROM annual_reviews ar
       JOIN tax_clients c ON c.id = ar.client_id
       WHERE ar.is_deleted = FALSE AND c.is_deleted = FALSE
         AND ar.year = $1 AND c.firm_id = ANY($2)
         AND (${DUE_FILTER_SQL.overdue})`,
      [year, firmIds],
    )

    const missing = await this.listMissingDate(actingUser)

    return {
      items: rowsResult.rows as AnnualReviewListItem[],
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(total / q.pageSize),
      year,
      years: yearsResult.rows.map((r) => r.year as number),
      statusCounts,
      overdueCount: overdueResult.rows[0].n as number,
      missingDateCount: missing.length,
    }
  },

  // Clients that pass every eligibility check EXCEPT having an incorporation date.
  // They produce no row, so without this list they would vanish silently — which is
  // exactly the kind of quiet gap a compliance tool must not have.
  async listMissingDate(actingUser: AuthUser): Promise<MissingDateClient[]> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) return []

    const result = await db.query(
      `SELECT c.id, c.name, et.name AS entity_type_name
       ${ELIGIBLE_CLIENT_SQL}
         AND c.dob_or_incorporation_date IS NULL
         AND c.firm_id = ANY($1)
       ORDER BY c.name ASC`,
      [firmIds],
    )
    return result.rows as MissingDateClient[]
  },

  // Status and notes only. Everything else on a row is derived from the client, so
  // there is deliberately no way to set it here.
  async update(id: string, data: UpdateAnnualReviewRequest): Promise<AnnualReviewListItem> {
    const updates: string[] = []
    const values: any[] = []
    let i = 1

    if (data.status !== undefined) {
      updates.push(`status = $${i++}`)
      values.push(data.status)
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${i++}`)
      values.push(data.notes ?? null)
    }
    // The Zod schema's refine guarantees at least one of the two is present, so
    // `updates` can never be empty here.

    values.push(id)
    const result = await db.query(
      `UPDATE annual_reviews SET ${updates.join(', ')}
       WHERE id = $${i} AND is_deleted = FALSE
       RETURNING id`,
      values,
    )
    if (result.rowCount === 0) {
      throw new AppError(annualReviewMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }

    const row = await db.query(`${ROW_SELECT} WHERE ar.id = $1`, [id])
    return row.rows[0] as AnnualReviewListItem
  },
}
