import type { PoolClient } from 'pg'
import { db } from '../../../lib/db'
import { taxTaskMessages } from '../config/tax-tasks.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { PERMISSIONS } from '../../../config/permissions.constants'
import {
  TASK_ACTIVITY_ACTIONS,
  type TaskActivityAction,
} from '../../../config/task-activity-actions.constants'
import type { ServiceFrequency } from '../../../config/service-frequencies.constants'
import type { TaskStatus } from '../../../config/task-statuses.constants'
import { TASK_PRIORITY_VALUES } from '../../../config/task-priorities.constants'
import type { TaskEditableField } from '../config/tax-tasks.schema'
import type { AuthUser } from '../../../middleware/auth.middleware'
import { taxClientService } from '../../tax-clients/services/tax-clients.service'
import type {
  CreateTaxTaskRequest,
  CreateGeneralTaskRequest,
  CreateTaxTaskResult,
  ReassignTaxTaskRequest,
  ListTaxTasksQuery,
  TaxTaskDetail,
  TaxTaskListResponse,
  TaxTaskWriteResult,
  TaxTaskFilterOptions,
  WorkStatusOptionsResponse,
  WorkStatusGridQuery,
  WorkStatusGridResponse,
  TaskChecklistItem,
  TaskPeriod,
} from '../types/tax-tasks.types'

// Columns selected for a task, joined with the human-readable names it references.
// `t` = tax_tasks; used by both getById and list (list omits checklist/description).
const DETAIL_SELECT = `
  t.id, t.task_type, t.title, t.client_id, cl.name AS client_name,
  t.service_id, s.name AS service_name, s.code AS service_code,
  t.financial_year_id, fy.year AS financial_year,
  t.frequency, t.quarter, t.month, t.fortnight_half, t.week,
  t.period_start_date, t.period_end_date,
  t.description, t.status, t.priority, t.due_date,
  t.work_status_id, ws.name AS work_status_name, ws.color AS work_status_color,
  t.checklist,
  t.preparer_id,
  CASE WHEN p.id IS NULL THEN NULL ELSE p.first_name || ' ' || p.last_name END AS preparer_name,
  t.reviewer_id,
  CASE WHEN r.id IS NULL THEN NULL ELSE r.first_name || ' ' || r.last_name END AS reviewer_name,
  t.created_at, t.updated_at`

const DETAIL_JOINS = `
  FROM tax_tasks t
  JOIN tax_clients cl ON cl.id = t.client_id
  LEFT JOIN services s ON s.id = t.service_id
  LEFT JOIN financial_years fy ON fy.id = t.financial_year_id
  LEFT JOIN members p ON p.id = t.preparer_id
  LEFT JOIN members r ON r.id = t.reviewer_id
  LEFT JOIN work_statuses ws ON ws.id = t.work_status_id`

// A caller's task visibility, derived once per request.
interface TaskScope {
  firmIds: string[] // firms (tax-practice) this member can see clients — and thus tasks — for
  canViewAll: boolean // TAX_TASK.VIEW_ALL — every task in those firms
  canViewAssigned: boolean // TAX_TASK.VIEW_ASSIGNED — only tasks where caller is preparer/reviewer
}

export const taxTaskService = {
  // ── Scope ──
  // Tasks inherit the tax-client firm scope (a task belongs to a tax client, which
  // belongs to a firm). On top of that, VIEW_ALL vs VIEW_ASSIGNED decides breadth.

  // Non-throwing: just computes what the caller can see. A caller with NEITHER
  // view permission (e.g. create-only) gets canViewAll = canViewAssigned = false —
  // meaning they can see NO tasks at all (used by create to decide the response).
  async computeScope(actingUser: AuthUser): Promise<TaskScope> {
    const firmIds = await taxClientService.accessibleFirmIds(actingUser.id)
    const canViewAll = actingUser.permissions.includes(PERMISSIONS.TAX_TASK.VIEW_ALL)
    const canViewAssigned = actingUser.permissions.includes(
      PERMISSIONS.TAX_TASK.VIEW_ASSIGNED,
    )
    return { firmIds, canViewAll, canViewAssigned }
  },

  // Read entry point: same as computeScope but rejects a caller who can see no
  // tasks. Guards list / getById so a create-only member never reads any task.
  async resolveScope(actingUser: AuthUser): Promise<TaskScope> {
    const scope = await this.computeScope(actingUser)
    if (!scope.canViewAll && !scope.canViewAssigned) {
      throw new AppError(taxTaskMessages.NO_VIEW_PERMISSION, HTTP_STATUS.FORBIDDEN)
    }
    return scope
  },

  // Whether a specific task row is visible to the caller under their scope:
  // in an accessible firm AND (VIEW_ALL, or VIEW_ASSIGNED as its preparer/reviewer).
  // A create-only caller (no view permission) can see nothing.
  canSeeRow(actingUser: AuthUser, scope: TaskScope, row: any): boolean {
    if (!row || !scope.firmIds.includes(row._firm_id)) return false
    if (scope.canViewAll) return true
    return (
      scope.canViewAssigned &&
      (row.preparer_id === actingUser.id || row.reviewer_id === actingUser.id)
    )
  },

  // ── LIST (server-driven: scoped, filtered, sorted, paginated) ──
  async list(actingUser: AuthUser, q: ListTaxTasksQuery): Promise<TaxTaskListResponse> {
    const scope = await this.resolveScope(actingUser)
    if (scope.firmIds.length === 0) {
      return { items: [], total: 0, page: q.page, pageSize: q.pageSize, totalPages: 0 }
    }

    const params: any[] = [scope.firmIds]
    const where: string[] = ['t.is_deleted = FALSE', 'cl.firm_id = ANY($1)']

    // VIEW_ASSIGNED without VIEW_ALL: only tasks the caller prepares or reviews.
    if (!scope.canViewAll) {
      params.push(actingUser.id)
      where.push(`(t.preparer_id = $${params.length} OR t.reviewer_id = $${params.length})`)
    }
    if (q.client_id) {
      params.push(q.client_id)
      where.push(`t.client_id = $${params.length}`)
    }
    if (q.service_id) {
      params.push(q.service_id)
      where.push(`t.service_id = $${params.length}`)
    }
    if (q.financial_year_id) {
      params.push(q.financial_year_id)
      where.push(`t.financial_year_id = $${params.length}`)
    }
    if (q.task_type) {
      params.push(q.task_type)
      where.push(`t.task_type = $${params.length}`)
    }
    if (q.status) {
      params.push(q.status)
      where.push(`t.status = $${params.length}`)
    }
    if (q.priority) {
      params.push(q.priority)
      where.push(`t.priority = $${params.length}`)
    }
    if (q.frequency) {
      params.push(q.frequency)
      where.push(`t.frequency = $${params.length}`)
    }
    // Preparer filter is VIEW_ALL-only: a VIEW_ASSIGNED caller is already limited
    // to their own tasks, so a cross-user filter is meaningless — ignore it for
    // them (see ALL_TASKS_PAGE_RULES.md §1).
    if (q.preparer_id && scope.canViewAll) {
      params.push(q.preparer_id)
      where.push(`t.preparer_id = $${params.length}`)
    }
    // Reviewer filter: VIEW_ALL-only, same rationale as preparer.
    if (q.reviewer_id && scope.canViewAll) {
      params.push(q.reviewer_id)
      where.push(`t.reviewer_id = $${params.length}`)
    }
    // Free-text search over the displayed name (task title for general tasks, the
    // service name for service tasks) and the client name (case-insensitive).
    if (q.search) {
      params.push(`%${q.search}%`)
      where.push(
        `(t.title ILIKE $${params.length} OR s.name ILIKE $${params.length} OR cl.name ILIKE $${params.length})`,
      )
    }
    const whereSql = where.join(' AND ')

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total ${DETAIL_JOINS} WHERE ${whereSql}`,
      params,
    )
    const total = countResult.rows[0].total as number

    // Allowlisted sort column + direction (never interpolate raw input).
    const sortCol = q.sort_by === 'due_date' ? 't.due_date' : 't.created_at'
    const sortDir = q.sort_dir === 'asc' ? 'ASC' : 'DESC'
    const offset = (q.page - 1) * q.pageSize

    const rowsResult = await db.query(
      `SELECT t.id, t.task_type, t.title, t.client_id, cl.name AS client_name,
              t.service_id, s.name AS service_name, s.code AS service_code,
              t.financial_year_id, fy.year AS financial_year,
              t.frequency, t.quarter, t.month, t.fortnight_half, t.week,
              t.period_start_date, t.period_end_date,
              t.status, t.priority, t.due_date,
              t.work_status_id, ws.name AS work_status_name, ws.color AS work_status_color,
              t.preparer_id,
              CASE WHEN p.id IS NULL THEN NULL ELSE p.first_name || ' ' || p.last_name END AS preparer_name,
              t.reviewer_id,
              CASE WHEN r.id IS NULL THEN NULL ELSE r.first_name || ' ' || r.last_name END AS reviewer_name,
              t.created_at
       ${DETAIL_JOINS}
       WHERE ${whereSql}
       ORDER BY ${sortCol} ${sortDir} NULLS LAST, t.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, offset],
    )

    return {
      items: rowsResult.rows,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(total / q.pageSize),
    }
  },

  // ── FILTER OPTIONS (for the global Tasks page dropdowns) ──
  // The distinct services / preparers / financial years that appear among the
  // caller's VISIBLE tasks — same scope as the list (VIEW_ALL → whole firm;
  // VIEW_ASSIGNED → own tasks). View-gated (not CREATE), so a view-only member can
  // load their filters. Status / priority / type / frequency are fixed enums and
  // don't need a route.
  async filterOptions(actingUser: AuthUser): Promise<TaxTaskFilterOptions> {
    const scope = await this.resolveScope(actingUser)
    if (scope.firmIds.length === 0) {
      return { services: [], preparers: [], reviewers: [], financialYears: [] }
    }

    const params: any[] = [scope.firmIds]
    const where: string[] = ['t.is_deleted = FALSE', 'cl.firm_id = ANY($1)']
    if (!scope.canViewAll) {
      params.push(actingUser.id)
      where.push(`(t.preparer_id = $${params.length} OR t.reviewer_id = $${params.length})`)
    }
    const whereSql = where.join(' AND ')

    const [services, preparers, reviewers, financialYears] = await Promise.all([
      db.query(
        `SELECT DISTINCT s.id, s.name ${DETAIL_JOINS}
         WHERE ${whereSql} AND s.id IS NOT NULL ORDER BY s.name ASC`,
        params,
      ),
      db.query(
        `SELECT DISTINCT p.id, p.first_name || ' ' || p.last_name AS name ${DETAIL_JOINS}
         WHERE ${whereSql} AND p.id IS NOT NULL ORDER BY name ASC`,
        params,
      ),
      db.query(
        `SELECT DISTINCT r.id, r.first_name || ' ' || r.last_name AS name ${DETAIL_JOINS}
         WHERE ${whereSql} AND r.id IS NOT NULL ORDER BY name ASC`,
        params,
      ),
      db.query(
        `SELECT DISTINCT fy.id, fy.year AS name ${DETAIL_JOINS}
         WHERE ${whereSql} AND fy.id IS NOT NULL ORDER BY name DESC`,
        params,
      ),
    ])

    return {
      services: services.rows,
      preparers: preparers.rows,
      reviewers: reviewers.rows,
      financialYears: financialYears.rows,
    }
  },

  // ── WORK STATUS BOARD ──
  // Pickers for the Work Status page: tax-practice services (with their allowed
  // frequencies) + financial years. Gated by WORK_STATUS_BOARD.VIEW at the route
  // (its own permission, independent of the task view codes).
  async workStatusOptions(): Promise<WorkStatusOptionsResponse> {
    const [services, financialYears] = await Promise.all([
      db.query(
        `SELECT id, name, frequencies FROM services
         WHERE department = 'tax_practice' AND is_deleted = FALSE
         ORDER BY LOWER(name) ASC`,
      ),
      db.query(
        `SELECT id, year AS name FROM financial_years
         WHERE is_deleted = FALSE ORDER BY year DESC`,
      ),
    ])
    return { services: services.rows, financialYears: financialYears.rows }
  },

  // The service-wise status grid for one service + frequency (+ scope). Rows are
  // clients using the service AT the selected frequency (firm-scoped) — the row
  // appears whether or not a task exists; empty periods show a dash. `tasks` are
  // the matching SERVICE tasks (general tasks never appear). The frontend pivots
  // tasks into client × period cells.
  async workStatusGrid(
    actingUser: AuthUser,
    q: WorkStatusGridQuery,
  ): Promise<WorkStatusGridResponse> {
    const firmIds = await taxClientService.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) return { clients: [], tasks: [] }

    // Validate the service exists, is tax-practice, and supports the frequency.
    await this.assertServiceAndFrequency(q.service_id, q.frequency)

    // Rows: clients using this service AT the selected frequency (their linked
    // frequency matches), firm-scoped. A client here with no task for a given
    // period simply shows a dash — the row appears whether or not a task exists.
    // EXISTS (not JOIN+DISTINCT) so ORDER BY LOWER(name) is valid.
    const clients = await db.query(
      `SELECT c.id, c.name
       FROM tax_clients c
       WHERE c.is_deleted = FALSE
         AND c.firm_id = ANY($1)
         AND EXISTS (
           SELECT 1 FROM tax_client_services tcs
           WHERE tcs.client_id = c.id
             AND tcs.service_id = $2
             AND tcs.frequency = $3
             AND tcs.is_deleted = FALSE
         )
       ORDER BY LOWER(c.name) ASC`,
      [firmIds, q.service_id, q.frequency],
    )

    // Matching service tasks in scope.
    const params: any[] = [firmIds, q.service_id, q.frequency]
    const where: string[] = [
      't.is_deleted = FALSE',
      'cl.firm_id = ANY($1)',
      "t.task_type = 'service'",
      't.service_id = $2',
      't.frequency = $3',
    ]
    if (q.financial_year_id) {
      params.push(q.financial_year_id)
      where.push(`t.financial_year_id = $${params.length}`)
    }
    if (q.month) {
      params.push(q.month)
      where.push(`t.month = $${params.length}`)
    }

    const tasks = await db.query(
      `SELECT t.id, t.client_id, t.financial_year_id, fy.year AS financial_year,
              t.quarter, t.month, t.fortnight_half, t.week,
              t.period_start_date, t.period_end_date, t.title,
              t.status, t.work_status_id, ws.name AS work_status_name, ws.color AS work_status_color,
              t.created_at
       FROM tax_tasks t
       JOIN tax_clients cl ON cl.id = t.client_id
       LEFT JOIN financial_years fy ON fy.id = t.financial_year_id
       LEFT JOIN work_statuses ws ON ws.id = t.work_status_id
       WHERE ${where.join(' AND ')}`,
      params,
    )

    return { clients: clients.rows, tasks: tasks.rows }
  },

  // Raw fetch of one task with its joined names + owning firm, no scope checks.
  // Returns the row (including `_firm_id`) or null. Callers apply visibility.
  async fetchRow(id: string): Promise<any | null> {
    const result = await db.query(
      `SELECT ${DETAIL_SELECT}, cl.firm_id AS _firm_id
       ${DETAIL_JOINS}
       WHERE t.id = $1 AND t.is_deleted = FALSE`,
      [id],
    )
    return result.rows[0] ?? null
  },

  // Load a task the caller is allowed to SEE (read scope + this specific row).
  // Rejects create-only callers (resolveScope) and returns NOT_FOUND for tasks
  // outside their firm / assignment. Used by getById and every mutation — you
  // can only act on a task you can see. Returns the raw row (keeps `_firm_id`).
  async loadVisibleRow(actingUser: AuthUser, id: string): Promise<any> {
    const scope = await this.resolveScope(actingUser)
    const row = await this.fetchRow(id)
    if (!this.canSeeRow(actingUser, scope, row)) {
      throw new AppError(taxTaskMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return row
  },

  // The response for any write (create / status / reassign / checklist): the full
  // detail if the caller can still VIEW the task afterwards, otherwise just the id.
  // A create-only member — or one who reassigned the task away from themselves —
  // never gets task data back. A write is never a read channel.
  async writeResult(actingUser: AuthUser, id: string): Promise<TaxTaskWriteResult> {
    const scope = await this.computeScope(actingUser)
    const row = await this.fetchRow(id)
    if (row && this.canSeeRow(actingUser, scope, row)) {
      delete row._firm_id
      return row as TaxTaskDetail
    }
    return { id }
  },

  // ── DETAIL (scoped) ──
  async getById(actingUser: AuthUser, id: string): Promise<TaxTaskDetail> {
    // Outside the member's firms, or (assigned-only) not their task → not found
    // (don't leak existence of tasks the caller isn't allowed to see).
    const row = await this.loadVisibleRow(actingUser, id)
    delete row._firm_id
    return row as TaxTaskDetail
  },

  // ── Validation helpers ──

  // The client must exist, be live, and sit in a firm this member can access.
  async assertClientAccessible(actingUser: AuthUser, clientId: string): Promise<void> {
    const firmIds = await taxClientService.accessibleFirmIds(actingUser.id)
    const result = await db.query(
      `SELECT firm_id FROM tax_clients WHERE id = $1 AND is_deleted = FALSE`,
      [clientId],
    )
    if (result.rows.length === 0) {
      throw new AppError(taxTaskMessages.CLIENT_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
    if (!firmIds.includes(result.rows[0].firm_id)) {
      throw new AppError(taxTaskMessages.CLIENT_NOT_ACCESSIBLE, HTTP_STATUS.FORBIDDEN)
    }
  },

  // The service must exist, be live, belong to the tax-practice department, and
  // support the chosen frequency. Returns nothing (throws on any failure).
  async assertServiceAndFrequency(
    serviceId: string,
    frequency: ServiceFrequency,
  ): Promise<void> {
    const result = await db.query(
      `SELECT department, frequencies FROM services WHERE id = $1 AND is_deleted = FALSE`,
      [serviceId],
    )
    if (result.rows.length === 0) {
      throw new AppError(taxTaskMessages.SERVICE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
    if (result.rows[0].department !== 'tax_practice') {
      throw new AppError(taxTaskMessages.SERVICE_NOT_TAX, HTTP_STATUS.BAD_REQUEST)
    }
    const allowed: string[] = result.rows[0].frequencies || []
    if (!allowed.includes(frequency)) {
      throw new AppError(taxTaskMessages.FREQUENCY_INVALID, HTTP_STATUS.BAD_REQUEST)
    }
  },

  async assertFinancialYearExists(id: string): Promise<void> {
    const result = await db.query(
      `SELECT id FROM financial_years WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(taxTaskMessages.FINANCIAL_YEAR_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
  },

  async assertMemberExists(id: string | null | undefined, message: string): Promise<void> {
    if (!id) return
    const result = await db.query(
      `SELECT id FROM members WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(message, HTTP_STATUS.BAD_REQUEST)
    }
  },

  // A member's display name (for activity detail so transitions read with names,
  // not ids). Null for a missing/unassigned member.
  async getMemberName(id: string | null | undefined): Promise<string | null> {
    if (!id) return null
    const result = await db.query(
      `SELECT first_name || ' ' || last_name AS name FROM members WHERE id = $1`,
      [id],
    )
    return result.rows[0]?.name ?? null
  },

  // Resolve which work status a new task starts at. If one was chosen it must
  // exist and be active; otherwise fall back to the master's current default
  // (which may be none, giving null).
  async resolveWorkStatusId(workStatusId: string | null | undefined): Promise<string | null> {
    if (workStatusId) {
      const result = await db.query(
        `SELECT is_active FROM work_statuses WHERE id = $1 AND is_deleted = FALSE`,
        [workStatusId],
      )
      if (result.rows.length === 0) {
        throw new AppError(taxTaskMessages.WORK_STATUS_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
      }
      if (!result.rows[0].is_active) {
        throw new AppError(taxTaskMessages.WORK_STATUS_INACTIVE, HTTP_STATUS.BAD_REQUEST)
      }
      return workStatusId
    }
    const def = await db.query(
      `SELECT id FROM work_statuses
       WHERE is_default = TRUE AND is_active = TRUE AND is_deleted = FALSE
       LIMIT 1`,
    )
    return def.rows[0]?.id ?? null
  },

  // A ONE-TIME service task carries its OWN required title — it has no recurring
  // period to name it by, and a client can have many under the same service. Every
  // recurring service task is labelled by its service, so it stores NO title (the
  // DB shape CHECK enforces this). Returns the title to persist, or null.
  resolveTitle(frequency: ServiceFrequency, data: CreateTaxTaskRequest): string | null {
    if (frequency !== 'one_time') return null
    const title = (data.title ?? '').trim()
    if (!title) {
      throw new AppError(taxTaskMessages.TITLE_REQUIRED, HTTP_STATUS.BAD_REQUEST)
    }
    return title
  },

  // Resolve the four sub-period columns from the frequency + supplied values.
  // Only the columns meaningful at that frequency are kept; the rest are forced
  // to 0 ("not applicable"), matching the tax_tasks period model. Throws a clear
  // message when a required sub-period is missing or out of range.
  resolvePeriod(frequency: ServiceFrequency, input: CreateTaxTaskRequest): TaskPeriod {
    const q = input.quarter ?? 0
    const m = input.month ?? 0
    const fh = input.fortnight_half ?? 0
    const w = input.week ?? 0
    const zero: TaskPeriod = { quarter: 0, month: 0, fortnight_half: 0, week: 0 }

    switch (frequency) {
      case 'yearly':
      // One-time (ad-hoc) work carries no sub-period, exactly like yearly.
      case 'one_time':
        return zero
      case 'quarterly':
        if (q < 1 || q > 4) {
          throw new AppError(taxTaskMessages.QUARTER_REQUIRED, HTTP_STATUS.BAD_REQUEST)
        }
        return { ...zero, quarter: q }
      case 'monthly':
        if (m < 1 || m > 12) {
          throw new AppError(taxTaskMessages.MONTH_REQUIRED, HTTP_STATUS.BAD_REQUEST)
        }
        return { ...zero, month: m }
      case 'fortnightly':
        if (m < 1 || m > 12) {
          throw new AppError(taxTaskMessages.MONTH_REQUIRED, HTTP_STATUS.BAD_REQUEST)
        }
        if (fh < 1 || fh > 2) {
          throw new AppError(taxTaskMessages.HALF_REQUIRED, HTTP_STATUS.BAD_REQUEST)
        }
        return { ...zero, month: m, fortnight_half: fh }
      case 'weekly':
        if (m < 1 || m > 12) {
          throw new AppError(taxTaskMessages.MONTH_REQUIRED, HTTP_STATUS.BAD_REQUEST)
        }
        if (w < 1 || w > 5) {
          throw new AppError(taxTaskMessages.WEEK_REQUIRED, HTTP_STATUS.BAD_REQUEST)
        }
        return { ...zero, month: m, week: w }
      default:
        throw new AppError(taxTaskMessages.PERIOD_INVALID, HTTP_STATUS.BAD_REQUEST)
    }
  },

  // Validate the informational period date range. These read-only dates are only
  // meaningful for weekly / fortnightly tasks (the span the sub-period covers) and
  // one_time tasks (the ad-hoc job's own range); null at every other frequency.
  // The end must not precede the start. Returns the null-normalised pair.
  resolvePeriodDates(
    frequency: ServiceFrequency,
    data: CreateTaxTaskRequest,
  ): { start: string | null; end: string | null } {
    const start = data.period_start_date ?? null
    const end = data.period_end_date ?? null
    if (start === null && end === null) return { start: null, end: null }

    if (frequency !== 'weekly' && frequency !== 'fortnightly' && frequency !== 'one_time') {
      throw new AppError(taxTaskMessages.PERIOD_DATES_NOT_ALLOWED, HTTP_STATUS.BAD_REQUEST)
    }
    if (start !== null && end !== null && end < start) {
      throw new AppError(taxTaskMessages.PERIOD_DATES_ORDER, HTTP_STATUS.BAD_REQUEST)
    }
    return { start, end }
  },

  // Reject a duplicate before hitting the DB unique index, for a friendly message.
  // one_time is exempt (ad-hoc work repeats freely) — mirrors the unique index,
  // which excludes one_time — so we skip the check entirely for it.
  async assertNoDuplicate(
    frequency: ServiceFrequency,
    clientId: string,
    serviceId: string,
    financialYearId: string,
    period: TaskPeriod,
  ): Promise<void> {
    if (frequency === 'one_time') return
    const result = await db.query(
      `SELECT id FROM tax_tasks
       WHERE client_id = $1 AND service_id = $2 AND financial_year_id = $3
         AND quarter = $4 AND month = $5 AND fortnight_half = $6 AND week = $7
         AND is_deleted = FALSE`,
      [
        clientId,
        serviceId,
        financialYearId,
        period.quarter,
        period.month,
        period.fortnight_half,
        period.week,
      ],
    )
    if (result.rows.length > 0) {
      throw new AppError(taxTaskMessages.DUPLICATE, HTTP_STATUS.CONFLICT)
    }
  },

  // Snapshot the service's ACTIVE checklist items into task-checklist elements.
  // Each item gets a fresh ULID (generate_ulid() is VOLATILE → distinct per row);
  // is_done/done_by/done_at start empty. Independent of the master after this.
  async snapshotChecklist(
    client: PoolClient,
    serviceId: string,
  ): Promise<TaskChecklistItem[]> {
    const result = await client.query(
      `SELECT generate_ulid() AS id, heading, description, is_required
       FROM service_checklist_items
       WHERE service_id = $1 AND is_active = TRUE AND is_deleted = FALSE
       ORDER BY sort_order ASC, heading ASC`,
      [serviceId],
    )
    return result.rows.map((r) => ({
      id: r.id,
      heading: r.heading,
      description: r.description ?? null,
      is_required: r.is_required,
      is_done: false,
      done_by: null,
      done_at: null,
    }))
  },

  // Turn the extra items supplied in the create form into checklist elements,
  // each with a fresh ULID (one round-trip: generate_ulid() is VOLATILE, so
  // generate_series gives N distinct ids). Appended after the service snapshot.
  async buildAdditionalChecklist(
    client: PoolClient,
    items: CreateTaxTaskRequest['additional_checklist_items'],
  ): Promise<TaskChecklistItem[]> {
    const list = items ?? []
    if (list.length === 0) return []
    const idsResult = await client.query(
      `SELECT generate_ulid() AS id FROM generate_series(1, $1::int)`,
      [list.length],
    )
    const ids: string[] = idsResult.rows.map((r) => r.id)
    return list.map((it, i) => ({
      id: ids[i],
      heading: it.heading,
      description: it.description ?? null,
      is_required: it.is_required ?? false,
      is_done: false,
      done_by: null,
      done_at: null,
    }))
  },

  // Append one row to the append-only activity log. Uses the given transaction
  // client so the event and its cause commit together.
  async logActivity(
    client: PoolClient,
    taskId: string,
    actorId: string,
    action: TaskActivityAction,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO tax_task_activity (task_id, actor_id, action, detail)
       VALUES ($1, $2, $3, $4)`,
      [taskId, actorId, action, JSON.stringify(detail)],
    )
  },

  // ── CREATE (task + snapshotted checklist + activity, one transaction) ──
  // No prerequisite view permission: tasks are created from the client / work-status
  // flows. Caller must have TAX_TASK.CREATE (enforced at the route) and access to
  // the client's firm (enforced here).
  async create(actingUser: AuthUser, data: CreateTaxTaskRequest): Promise<CreateTaxTaskResult> {
    await this.assertClientAccessible(actingUser, data.client_id)
    await this.assertServiceAndFrequency(data.service_id, data.frequency)
    await this.assertFinancialYearExists(data.financial_year_id)
    await this.assertMemberExists(data.preparer_id, taxTaskMessages.PREPARER_NOT_FOUND)
    await this.assertMemberExists(data.reviewer_id, taxTaskMessages.REVIEWER_NOT_FOUND)

    const period = this.resolvePeriod(data.frequency, data)
    const periodDates = this.resolvePeriodDates(data.frequency, data)
    const title = this.resolveTitle(data.frequency, data)
    const workStatusId = await this.resolveWorkStatusId(data.work_status_id)
    await this.assertNoDuplicate(
      data.frequency,
      data.client_id,
      data.service_id,
      data.financial_year_id,
      period,
    )

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      // Service's active items (snapshot) + any extra items from the form.
      const serviceItems = await this.snapshotChecklist(client, data.service_id)
      const extraItems = await this.buildAdditionalChecklist(client, data.additional_checklist_items)
      const checklist = [...serviceItems, ...extraItems]

      const inserted = await client.query(
        `INSERT INTO tax_tasks (
           client_id, service_id, financial_year_id, frequency, title,
           quarter, month, fortnight_half, week,
           period_start_date, period_end_date,
           description, priority, due_date, work_status_id, checklist,
           preparer_id, reviewer_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id`,
        [
          data.client_id,
          data.service_id,
          data.financial_year_id,
          data.frequency,
          title,
          period.quarter,
          period.month,
          period.fortnight_half,
          period.week,
          periodDates.start,
          periodDates.end,
          data.description ?? null,
          data.priority,
          data.due_date ?? null,
          workStatusId,
          JSON.stringify(checklist),
          data.preparer_id ?? null,
          data.reviewer_id ?? null,
        ],
      )
      const taskId = inserted.rows[0].id as string

      await this.logActivity(client, taskId, actingUser.id, TASK_ACTIVITY_ACTIONS.TASK_CREATED)

      await client.query('COMMIT')

      // Return the detail only if the creator can VIEW it; otherwise just the id
      // (a create-only member, or a VIEW_ASSIGNED member who assigned it to others).
      return this.writeResult(actingUser, taskId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── CREATE GENERAL (ad-hoc task, no service / frequency / period) ──
  // Belongs to a client + financial year, carries a title, and has an entirely
  // user-defined checklist. The assignee is stored in preparer_id; there is no
  // reviewer. Same firm-access rule as a service task (client is required).
  async createGeneral(
    actingUser: AuthUser,
    data: CreateGeneralTaskRequest,
  ): Promise<CreateTaxTaskResult> {
    await this.assertClientAccessible(actingUser, data.client_id)
    await this.assertFinancialYearExists(data.financial_year_id)
    await this.assertMemberExists(data.preparer_id, taxTaskMessages.PREPARER_NOT_FOUND)

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      // The whole checklist is user-defined — there is no service to snapshot from.
      const checklist = await this.buildAdditionalChecklist(client, data.checklist_items)

      const inserted = await client.query(
        `INSERT INTO tax_tasks (
           task_type, client_id, financial_year_id, title,
           description, status, priority, due_date, checklist, preparer_id
         ) VALUES ('general',$1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          data.client_id,
          data.financial_year_id,
          data.title,
          data.description ?? null,
          data.status,
          data.priority,
          data.due_date ?? null,
          JSON.stringify(checklist),
          data.preparer_id ?? null,
        ],
      )
      const taskId = inserted.rows[0].id as string

      await this.logActivity(client, taskId, actingUser.id, TASK_ACTIVITY_ACTIONS.TASK_CREATED)

      await client.query('COMMIT')
      return this.writeResult(actingUser, taskId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── CHANGE STATUS ──
  // Anyone who can SEE the task may move its status. Guards on completion:
  //   • for SERVICE tasks, only the task's reviewer may set it to 'completed'
  //     (general tasks have no reviewer, so any viewer may complete them)
  //   • every REQUIRED checklist item must be done first (both task types)
  async changeStatus(
    actingUser: AuthUser,
    id: string,
    status: TaskStatus,
  ): Promise<TaxTaskWriteResult> {
    const row = await this.loadVisibleRow(actingUser, id)
    const from: TaskStatus = row.status
    if (from === status) return this.writeResult(actingUser, id) // no-op, no log

    if (status === 'completed') {
      // Reviewer gate applies to service tasks only; general tasks have no reviewer.
      if (row.task_type === 'service' && row.reviewer_id !== actingUser.id) {
        throw new AppError(taxTaskMessages.ONLY_REVIEWER_COMPLETES, HTTP_STATUS.FORBIDDEN)
      }
      const checklist: TaskChecklistItem[] = row.checklist || []
      const hasUnfinishedRequired = checklist.some((i) => i.is_required && !i.is_done)
      if (hasUnfinishedRequired) {
        throw new AppError(
          taxTaskMessages.REQUIRED_CHECKLIST_INCOMPLETE,
          HTTP_STATUS.BAD_REQUEST,
        )
      }
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE tax_tasks SET status = $1 WHERE id = $2`, [status, id])
      await this.logActivity(client, id, actingUser.id, TASK_ACTIVITY_ACTIONS.STATUS_CHANGED, {
        from,
        to: status,
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.writeResult(actingUser, id)
  },

  // ── REASSIGN preparer / reviewer ──
  // Allowed for VIEW_ALL members, or the task's currently-assigned preparer.
  // Only the fields provided are changed (undefined = leave as-is, null = unassign);
  // each field that actually changes emits its own activity row.
  async reassign(
    actingUser: AuthUser,
    id: string,
    data: ReassignTaxTaskRequest,
  ): Promise<TaxTaskWriteResult> {
    const row = await this.loadVisibleRow(actingUser, id)

    const canViewAll = actingUser.permissions.includes(PERMISSIONS.TAX_TASK.VIEW_ALL)
    const isAssignedPreparer = row.preparer_id === actingUser.id
    if (!canViewAll && !isAssignedPreparer) {
      throw new AppError(taxTaskMessages.REASSIGN_FORBIDDEN, HTTP_STATUS.FORBIDDEN)
    }

    // Normalise: `undefined` = not touched; `null`/id = the new value. A general
    // task has no reviewer (shape CHECK keeps reviewer_id null), so any reviewer
    // change is ignored for it — only the assignee (preparer) can move.
    const isGeneral = row.task_type === 'general'
    const nextPreparer =
      data.preparer_id !== undefined ? data.preparer_id ?? null : undefined
    const nextReviewer =
      isGeneral || data.reviewer_id === undefined ? undefined : data.reviewer_id ?? null
    if (nextPreparer !== undefined) {
      await this.assertMemberExists(nextPreparer, taxTaskMessages.PREPARER_NOT_FOUND)
    }
    if (nextReviewer !== undefined) {
      await this.assertMemberExists(nextReviewer, taxTaskMessages.REVIEWER_NOT_FOUND)
    }

    const preparerChanges = nextPreparer !== undefined && nextPreparer !== row.preparer_id
    const reviewerChanges = nextReviewer !== undefined && nextReviewer !== row.reviewer_id
    if (!preparerChanges && !reviewerChanges) return this.writeResult(actingUser, id)

    // Resolve the incoming assignees' names so the activity line reads "from X to Y".
    const preparerToName = preparerChanges ? await this.getMemberName(nextPreparer) : null
    const reviewerToName = reviewerChanges ? await this.getMemberName(nextReviewer) : null

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      if (preparerChanges) {
        await client.query(`UPDATE tax_tasks SET preparer_id = $1 WHERE id = $2`, [
          nextPreparer,
          id,
        ])
        await this.logActivity(client, id, actingUser.id, TASK_ACTIVITY_ACTIONS.PREPARER_CHANGED, {
          from: row.preparer_id,
          to: nextPreparer,
          from_name: row.preparer_name ?? null,
          to_name: preparerToName,
        })
      }
      if (reviewerChanges) {
        await client.query(`UPDATE tax_tasks SET reviewer_id = $1 WHERE id = $2`, [
          nextReviewer,
          id,
        ])
        await this.logActivity(client, id, actingUser.id, TASK_ACTIVITY_ACTIONS.REVIEWER_CHANGED, {
          from: row.reviewer_id,
          to: nextReviewer,
          from_name: row.reviewer_name ?? null,
          to_name: reviewerToName,
        })
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.writeResult(actingUser, id)
  },

  // ── TICK / UNTICK a checklist item ──
  // Anyone who can SEE the task may toggle an item. Ticking stamps done_by/done_at;
  // unticking clears them. The whole checklist JSONB is rewritten with the change.
  async setChecklistItemDone(
    actingUser: AuthUser,
    id: string,
    itemId: string,
    isDone: boolean,
  ): Promise<TaxTaskWriteResult> {
    const row = await this.loadVisibleRow(actingUser, id)
    const checklist: TaskChecklistItem[] = row.checklist || []
    const item = checklist.find((i) => i.id === itemId)
    if (!item) {
      throw new AppError(taxTaskMessages.CHECKLIST_ITEM_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    if (item.is_done === isDone) return this.writeResult(actingUser, id) // no-op, no log

    const doneAt = isDone ? new Date().toISOString() : null
    const doneBy = isDone ? actingUser.id : null
    const updated = checklist.map((i) =>
      i.id === itemId ? { ...i, is_done: isDone, done_by: doneBy, done_at: doneAt } : i,
    )

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE tax_tasks SET checklist = $1 WHERE id = $2`, [
        JSON.stringify(updated),
        id,
      ])
      await this.logActivity(
        client,
        id,
        actingUser.id,
        isDone
          ? TASK_ACTIVITY_ACTIONS.CHECKLIST_ITEM_CHECKED
          : TASK_ACTIVITY_ACTIONS.CHECKLIST_ITEM_UNCHECKED,
        { item_id: itemId, heading: item.heading },
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.writeResult(actingUser, id)
  },

  // Who may edit a task's plain fields (priority / work status / description / due
  // date / period dates): a VIEW_ALL member, or the task's assigned preparer —
  // same rule as reassignment. (The reviewer, and a plain viewer, may not.)
  assertCanEdit(actingUser: AuthUser, row: any): void {
    const canViewAll = actingUser.permissions.includes(PERMISSIONS.TAX_TASK.VIEW_ALL)
    const isAssignedPreparer = row.preparer_id === actingUser.id
    if (!canViewAll && !isAssignedPreparer) {
      throw new AppError(taxTaskMessages.EDIT_FORBIDDEN, HTTP_STATUS.FORBIDDEN)
    }
  },

  // ── EDIT ONE PLAIN FIELD (PATCH /:id/:field) ──
  // The single entry point for the modal's auto-save. `field` is a validated,
  // allowlisted name; `value` is a string or null. Each field resolves its target
  // column, next value, and activity action; a no-op (value unchanged) neither
  // writes nor logs. The column name comes only from the fixed allowlist below —
  // never from raw input — so interpolating it into the UPDATE is safe.
  async updateField(
    actingUser: AuthUser,
    id: string,
    field: TaskEditableField,
    value: string | null,
  ): Promise<TaxTaskWriteResult> {
    const row = await this.loadVisibleRow(actingUser, id)
    this.assertCanEdit(actingUser, row)

    let column: string
    let next: string | null
    let action: TaskActivityAction
    let detail: Record<string, unknown>

    switch (field) {
      case 'priority': {
        if (value === null || !(TASK_PRIORITY_VALUES as readonly string[]).includes(value)) {
          throw new AppError(taxTaskMessages.INVALID_PRIORITY, HTTP_STATUS.BAD_REQUEST)
        }
        if (value === row.priority) return this.writeResult(actingUser, id)
        column = 'priority'
        next = value
        action = TASK_ACTIVITY_ACTIONS.PRIORITY_CHANGED
        detail = { from: row.priority, to: next }
        break
      }
      case 'work-status': {
        const wsId = value && value.trim() ? value.trim() : null
        let toName: string | null = null
        if (wsId) {
          const ws = await db.query(
            `SELECT name, is_active FROM work_statuses WHERE id = $1 AND is_deleted = FALSE`,
            [wsId],
          )
          if (ws.rows.length === 0) {
            throw new AppError(taxTaskMessages.WORK_STATUS_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
          }
          if (!ws.rows[0].is_active) {
            throw new AppError(taxTaskMessages.WORK_STATUS_INACTIVE, HTTP_STATUS.BAD_REQUEST)
          }
          toName = ws.rows[0].name
        }
        if (wsId === (row.work_status_id ?? null)) return this.writeResult(actingUser, id)
        column = 'work_status_id'
        next = wsId
        action = TASK_ACTIVITY_ACTIONS.WORK_STATUS_CHANGED
        detail = {
          from: row.work_status_id ?? null,
          to: wsId,
          from_name: row.work_status_name ?? null,
          to_name: toName,
        }
        break
      }
      case 'description': {
        const text = value && value.trim() ? value : null
        if (text === (row.description ?? null)) return this.writeResult(actingUser, id)
        column = 'description'
        next = text
        action = TASK_ACTIVITY_ACTIONS.DESCRIPTION_CHANGED
        // Store the old + new text in the audit log (not surfaced in the UI, but
        // retained in the DB so the before/after is recoverable).
        detail = { from: row.description ?? null, to: text }
        break
      }
      case 'due-date': {
        let iso: string | null = null
        if (value && value.trim()) {
          const d = new Date(value)
          if (Number.isNaN(d.getTime())) {
            throw new AppError(taxTaskMessages.DUE_DATE_INVALID, HTTP_STATUS.BAD_REQUEST)
          }
          iso = d.toISOString()
        }
        const currentIso = row.due_date ? new Date(row.due_date).toISOString() : null
        if (iso === currentIso) return this.writeResult(actingUser, id)
        column = 'due_date'
        next = iso
        action = TASK_ACTIVITY_ACTIONS.DUE_DATE_CHANGED
        detail = { from: currentIso, to: iso }
        break
      }
      case 'period-start':
      case 'period-end': {
        // Period dates exist only for weekly / fortnightly / one-time tasks.
        const freq = row.frequency
        if (freq !== 'weekly' && freq !== 'fortnightly' && freq !== 'one_time') {
          throw new AppError(taxTaskMessages.PERIOD_DATES_NOT_ALLOWED, HTTP_STATUS.BAD_REQUEST)
        }
        const date = value && value.trim() ? value.trim() : null
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new AppError(taxTaskMessages.PERIOD_DATE_INVALID, HTTP_STATUS.BAD_REQUEST)
        }
        // Compare / order-check against the sibling's stored value (as plain text,
        // so a DATE column never round-trips through a timezone).
        const cur = await db.query(
          `SELECT to_char(period_start_date, 'YYYY-MM-DD') AS start,
                  to_char(period_end_date, 'YYYY-MM-DD') AS "end"
           FROM tax_tasks WHERE id = $1`,
          [id],
        )
        const currentStart = (cur.rows[0].start as string | null) ?? null
        const currentEnd = (cur.rows[0].end as string | null) ?? null
        const bound = field === 'period-start' ? 'start' : 'end'
        if (bound === 'start' && date && currentEnd && date > currentEnd) {
          throw new AppError(taxTaskMessages.PERIOD_DATES_ORDER, HTTP_STATUS.BAD_REQUEST)
        }
        if (bound === 'end' && date && currentStart && date < currentStart) {
          throw new AppError(taxTaskMessages.PERIOD_DATES_ORDER, HTTP_STATUS.BAD_REQUEST)
        }
        const current = bound === 'start' ? currentStart : currentEnd
        if (date === current) return this.writeResult(actingUser, id)
        column = bound === 'start' ? 'period_start_date' : 'period_end_date'
        next = date
        action = TASK_ACTIVITY_ACTIONS.PERIOD_DATES_CHANGED
        detail = { bound, from: current, to: date }
        break
      }
      default:
        throw new AppError(taxTaskMessages.UNKNOWN_FIELD, HTTP_STATUS.BAD_REQUEST)
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE tax_tasks SET ${column} = $1 WHERE id = $2`, [next, id])
      await this.logActivity(client, id, actingUser.id, action, detail)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.writeResult(actingUser, id)
  },
}
