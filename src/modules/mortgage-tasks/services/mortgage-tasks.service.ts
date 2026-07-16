import type { PoolClient } from 'pg'
import { db } from '../../../lib/db'
import { mortgageTaskMessages } from '../config/mortgage-tasks.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { PERMISSIONS } from '../../../config/permissions.constants'
import {
  mortgageStatusNeedsDescription,
  type MortgageTaskStatus,
} from '../../../config/mortgage-task-statuses.constants'
import {
  MORTGAGE_TASK_ACTIVITY_ACTIONS,
  type MortgageTaskActivityAction,
} from '../../../config/mortgage-task-activity-actions.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import type {
  CreateMortgageTaskRequest,
  UpdateMortgageTaskRequest,
  ChangeMortgageTaskStatusRequest,
  CreateMortgageTaskNoteRequest,
  UpdateMortgageTaskNoteRequest,
  ListMortgageTasksQuery,
  MortgageTaskListItem,
  MortgageTaskListResponse,
  MortgageTaskDetail,
  MortgageTaskNote,
  MortgageTaskMemberOption,
  MortgageTaskActivityListResponse,
} from '../types/mortgage-tasks.types'

// A task row + firm/loan-type names + embedded followers + note count + creator name.
// `t` = mortgage_tasks. Used by both list and getById.
const ROW_SELECT = `
  t.id, t.firm_id, fi.name AS firm_name,
  t.loan_type_id, lt.name AS loan_type_name,
  t.client_name, t.financial_institution, t.summary, t.status,
  t.created_by,
  CASE WHEN cb.id IS NULL THEN NULL ELSE cb.first_name || ' ' || cb.last_name END AS creator_name,
  t.created_at, t.updated_at,
  COALESCE((
    SELECT json_agg(
             json_build_object(
               'member_id', f.member_id,
               'name', fm.first_name || ' ' || fm.last_name
             ) ORDER BY fm.first_name, fm.last_name
           )
    FROM mortgage_task_followers f
    JOIN members fm ON fm.id = f.member_id
    WHERE f.task_id = t.id
  ), '[]'::json) AS followers,
  (SELECT COUNT(*)::int
     FROM mortgage_task_notes n
    WHERE n.task_id = t.id AND n.is_deleted = FALSE) AS note_count`

const ROW_JOINS = `
  FROM mortgage_tasks t
  LEFT JOIN firms fi ON fi.id = t.firm_id
  LEFT JOIN loan_types lt ON lt.id = t.loan_type_id
  LEFT JOIN members cb ON cb.id = t.created_by`

function mapRow(row: any): MortgageTaskListItem {
  return {
    id: row.id,
    firm_id: row.firm_id,
    firm_name: row.firm_name,
    loan_type_id: row.loan_type_id,
    loan_type_name: row.loan_type_name,
    client_name: row.client_name,
    financial_institution: row.financial_institution,
    summary: row.summary,
    status: row.status,
    created_by: row.created_by,
    creator_name: row.creator_name,
    followers: row.followers ?? [],
    note_count: row.note_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const mortgageTaskService = {
  // Firms this member can act in: their granted firms that belong to the Mortgage
  // department. The outer boundary on every read/write.
  async accessibleFirmIds(memberId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT mf.firm_id
       FROM member_firms mf
       JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE AND f.department = 'mortgage'
       WHERE mf.member_id = $1`,
      [memberId],
    )
    return result.rows.map((r) => r.firm_id as string)
  },

  hasViewAll(user: AuthUser): boolean {
    return user.permissions.includes(PERMISSIONS.MORTGAGE_TASK.VIEW_ALL)
  },

  // ── LIST (firm-scoped; VIEW_ALL widens to the whole firm, else own/followed) ──
  async list(actingUser: AuthUser, q: ListMortgageTasksQuery): Promise<MortgageTaskListResponse> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) {
      return { items: [], total: 0, page: q.page, pageSize: q.pageSize, totalPages: 0 }
    }

    const params: any[] = [firmIds]
    const where: string[] = ['t.is_deleted = FALSE', 't.firm_id = ANY($1)']

    if (!this.hasViewAll(actingUser)) {
      params.push(actingUser.id)
      where.push(
        `(t.created_by = $${params.length} OR EXISTS (
           SELECT 1 FROM mortgage_task_followers f
           WHERE f.task_id = t.id AND f.member_id = $${params.length}))`,
      )
    }
    if (q.firm_id) {
      params.push(q.firm_id)
      where.push(`t.firm_id = $${params.length}`)
    }
    if (q.status) {
      params.push(q.status)
      where.push(`t.status = $${params.length}`)
    }
    if (q.loan_type_id) {
      params.push(q.loan_type_id)
      where.push(`t.loan_type_id = $${params.length}`)
    }
    if (q.follower_id) {
      params.push(q.follower_id)
      where.push(
        `EXISTS (SELECT 1 FROM mortgage_task_followers f2
                 WHERE f2.task_id = t.id AND f2.member_id = $${params.length})`,
      )
    }
    if (q.search) {
      params.push(`%${q.search}%`)
      where.push(`(t.client_name ILIKE $${params.length} OR t.financial_institution ILIKE $${params.length})`)
    }

    const whereSql = where.join(' AND ')
    const orderDir = q.sort_dir === 'asc' ? 'ASC' : 'DESC'

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total ${ROW_JOINS} WHERE ${whereSql}`,
      params,
    )
    const total = countResult.rows[0]?.total ?? 0

    const offset = (q.page - 1) * q.pageSize
    const listParams = [...params, q.pageSize, offset]
    const listResult = await db.query(
      `SELECT ${ROW_SELECT} ${ROW_JOINS}
       WHERE ${whereSql}
       ORDER BY t.created_at ${orderDir} NULLS LAST, t.id DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    )

    return {
      items: listResult.rows.map(mapRow),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(total / q.pageSize),
    }
  },

  // ── GET ONE (with notes) — 404 if the caller can't see it ──
  async getById(actingUser: AuthUser, id: string): Promise<MortgageTaskDetail> {
    await this.loadVisibleRow(actingUser, id)
    const result = await db.query(
      `SELECT ${ROW_SELECT} ${ROW_JOINS} WHERE t.id = $1 AND t.is_deleted = FALSE`,
      [id],
    )
    const notes = await this.fetchNotes(id)
    return { ...mapRow(result.rows[0]), notes }
  },

  // Visibility = writability. Returns the task's core row or 404 if the caller can't
  // see it: firm not accessible, or (no VIEW_ALL and not creator/follower).
  async loadVisibleRow(
    actingUser: AuthUser,
    id: string,
  ): Promise<{ created_by: string; firm_id: string; status: MortgageTaskStatus }> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) {
      throw new AppError(mortgageTaskMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    const params: any[] = [id, firmIds]
    let visible = 't.firm_id = ANY($2)'
    if (!this.hasViewAll(actingUser)) {
      params.push(actingUser.id)
      visible += ` AND (t.created_by = $${params.length} OR EXISTS (
        SELECT 1 FROM mortgage_task_followers f
        WHERE f.task_id = t.id AND f.member_id = $${params.length}))`
    }
    const result = await db.query(
      `SELECT t.created_by, t.firm_id, t.status
       FROM mortgage_tasks t
       WHERE t.id = $1 AND t.is_deleted = FALSE AND ${visible}`,
      params,
    )
    if (result.rows.length === 0) {
      throw new AppError(mortgageTaskMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  async fetchNotes(taskId: string): Promise<MortgageTaskNote[]> {
    const result = await db.query(
      `SELECT n.id, n.kind, n.body, n.from_status, n.to_status, n.created_by,
              CASE WHEN m.id IS NULL THEN NULL ELSE m.first_name || ' ' || m.last_name END AS created_by_name,
              (n.updated_at > n.created_at) AS edited,
              n.created_at, n.updated_at
       FROM mortgage_task_notes n
       LEFT JOIN members m ON m.id = n.created_by
       WHERE n.task_id = $1 AND n.is_deleted = FALSE
       ORDER BY n.created_at ASC`,
      [taskId],
    )
    return result.rows as MortgageTaskNote[]
  },

  // Append one activity row (within the given client's txn, or a fresh query).
  async logActivity(
    client: PoolClient | typeof db,
    taskId: string,
    actorId: string,
    action: MortgageTaskActivityAction,
    detail: Record<string, any> = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO mortgage_task_activity (task_id, actor_id, action, detail)
       VALUES ($1, $2, $3, $4)`,
      [taskId, actorId, action, JSON.stringify(detail)],
    )
  },

  // Validate + normalise a follower id list: dedupe, drop the creator, and confirm
  // each is a real, active member WITH access to the task's firm. Returns clean ids.
  async normaliseFollowers(
    followerIds: string[],
    creatorId: string,
    firmId: string,
  ): Promise<string[]> {
    const ids = [...new Set(followerIds)].filter((id) => id !== creatorId)
    if (ids.length === 0) return []
    const result = await db.query(
      `SELECT mf.member_id
       FROM member_firms mf
       JOIN members m ON m.id = mf.member_id AND m.is_deleted = FALSE
       JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE AND f.department = 'mortgage'
       WHERE mf.member_id = ANY($1) AND mf.firm_id = $2`,
      [ids, firmId],
    )
    const valid = new Set(result.rows.map((r) => r.member_id as string))
    for (const id of ids) {
      if (!valid.has(id)) {
        throw new AppError(mortgageTaskMessages.FOLLOWER_NO_FIRM_ACCESS, HTTP_STATUS.BAD_REQUEST)
      }
    }
    return ids
  },

  // ── CREATE ──
  async create(
    actingUser: AuthUser,
    data: CreateMortgageTaskRequest,
  ): Promise<MortgageTaskDetail> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (!firmIds.includes(data.firm_id)) {
      throw new AppError(mortgageTaskMessages.FIRM_NOT_ACCESSIBLE, HTTP_STATUS.FORBIDDEN)
    }
    const followerIds = await this.normaliseFollowers(
      data.follower_ids,
      actingUser.id,
      data.firm_id,
    )

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      const inserted = await client.query(
        `INSERT INTO mortgage_tasks
           (firm_id, loan_type_id, client_name, financial_institution, summary, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          data.firm_id,
          data.loan_type_id,
          data.client_name,
          data.financial_institution ?? null,
          data.summary ?? null,
          actingUser.id,
        ],
      )
      const taskId = inserted.rows[0].id as string

      for (const memberId of followerIds) {
        await client.query(
          `INSERT INTO mortgage_task_followers (task_id, member_id) VALUES ($1, $2)`,
          [taskId, memberId],
        )
      }

      if (data.note) {
        await client.query(
          `INSERT INTO mortgage_task_notes (task_id, kind, body, created_by)
           VALUES ($1, 'note', $2, $3)`,
          [taskId, data.note, actingUser.id],
        )
      }

      await this.logActivity(client, taskId, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.TASK_CREATED)

      await client.query('COMMIT')
      return this.getById(actingUser, taskId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── UPDATE core fields (loan type / client / institution / summary) ──
  async update(
    actingUser: AuthUser,
    id: string,
    data: UpdateMortgageTaskRequest,
  ): Promise<MortgageTaskDetail> {
    await this.loadVisibleRow(actingUser, id)

    const sets: string[] = []
    const params: any[] = []
    const changed: string[] = []
    if (data.loan_type_id !== undefined) {
      params.push(data.loan_type_id)
      sets.push(`loan_type_id = $${params.length}`)
      changed.push('loan_type_id')
    }
    if (data.client_name !== undefined) {
      params.push(data.client_name)
      sets.push(`client_name = $${params.length}`)
      changed.push('client_name')
    }
    if (data.financial_institution !== undefined) {
      params.push(data.financial_institution ?? null)
      sets.push(`financial_institution = $${params.length}`)
      changed.push('financial_institution')
    }
    if (data.summary !== undefined) {
      params.push(data.summary ?? null)
      sets.push(`summary = $${params.length}`)
      changed.push('summary')
    }

    if (sets.length > 0) {
      params.push(id)
      await db.query(
        `UPDATE mortgage_tasks SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      )
      await this.logActivity(db, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.TASK_UPDATED, {
        fields: changed,
      })
    }
    return this.getById(actingUser, id)
  },

  // ── CHANGE STATUS — writes a status-change note; description required unless the
  // target is not_started. Any transition is allowed. ──
  async changeStatus(
    actingUser: AuthUser,
    id: string,
    data: ChangeMortgageTaskStatusRequest,
  ): Promise<MortgageTaskDetail> {
    const row = await this.loadVisibleRow(actingUser, id)
    const description = data.description?.trim() || null
    if (mortgageStatusNeedsDescription(data.status) && !description) {
      throw new AppError(
        mortgageTaskMessages.STATUS_DESCRIPTION_REQUIRED,
        HTTP_STATUS.BAD_REQUEST,
      )
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE mortgage_tasks SET status = $1 WHERE id = $2`, [data.status, id])
      await client.query(
        `INSERT INTO mortgage_task_notes (task_id, kind, body, from_status, to_status, created_by)
         VALUES ($1, 'status_change', $2, $3, $4, $5)`,
        [id, description, row.status, data.status, actingUser.id],
      )
      await this.logActivity(client, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.STATUS_CHANGED, {
        from: row.status,
        to: data.status,
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.getById(actingUser, id)
  },

  // ── REPLACE the follower set (validated against the task's firm) ──
  async setFollowers(
    actingUser: AuthUser,
    id: string,
    followerIds: string[],
  ): Promise<MortgageTaskDetail> {
    const row = await this.loadVisibleRow(actingUser, id)
    const nextIds = await this.normaliseFollowers(followerIds, row.created_by, row.firm_id)

    const existing = await db.query(
      `SELECT member_id FROM mortgage_task_followers WHERE task_id = $1`,
      [id],
    )
    const prevIds = new Set(existing.rows.map((r) => r.member_id as string))
    const nextSet = new Set(nextIds)
    const added = nextIds.filter((m) => !prevIds.has(m))
    const removed = [...prevIds].filter((m) => !nextSet.has(m))

    // Names for the activity detail of the changed members.
    const changedIds = [...added, ...removed]
    const names = new Map<string, string>()
    if (changedIds.length > 0) {
      const nameRows = await db.query(
        `SELECT id, first_name || ' ' || last_name AS name FROM members WHERE id = ANY($1)`,
        [changedIds],
      )
      for (const r of nameRows.rows) names.set(r.id, r.name)
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM mortgage_task_followers WHERE task_id = $1`, [id])
      for (const memberId of nextIds) {
        await client.query(
          `INSERT INTO mortgage_task_followers (task_id, member_id) VALUES ($1, $2)`,
          [id, memberId],
        )
      }
      for (const memberId of added) {
        await this.logActivity(client, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.FOLLOWER_ADDED, {
          member_id: memberId,
          name: names.get(memberId) ?? null,
        })
      }
      for (const memberId of removed) {
        await this.logActivity(client, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.FOLLOWER_REMOVED, {
          member_id: memberId,
          name: names.get(memberId) ?? null,
        })
      }
      // Touch the parent so updated_at reflects the change (followers is a child table).
      await client.query(`UPDATE mortgage_tasks SET updated_at = NOW() WHERE id = $1`, [id])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.getById(actingUser, id)
  },

  // ── Member options for the follower picker: members with access to `firmId`. The
  // caller must be able to access the firm too. ──
  async memberOptionsForFirm(
    actingUser: AuthUser,
    firmId: string,
  ): Promise<MortgageTaskMemberOption[]> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (!firmIds.includes(firmId)) {
      throw new AppError(mortgageTaskMessages.FIRM_NOT_ACCESSIBLE, HTTP_STATUS.FORBIDDEN)
    }
    const result = await db.query(
      `SELECT m.id, m.first_name || ' ' || m.last_name AS name
       FROM member_firms mf
       JOIN members m ON m.id = mf.member_id AND m.is_deleted = FALSE
       WHERE mf.firm_id = $1
       ORDER BY m.first_name, m.last_name`,
      [firmId],
    )
    return result.rows as MortgageTaskMemberOption[]
  },

  // ── NOTES (plain notes only; status-change notes are immutable, author-scoped) ──
  async listNotes(actingUser: AuthUser, id: string): Promise<MortgageTaskNote[]> {
    await this.loadVisibleRow(actingUser, id)
    return this.fetchNotes(id)
  },

  async addNote(
    actingUser: AuthUser,
    id: string,
    data: CreateMortgageTaskNoteRequest,
  ): Promise<MortgageTaskNote> {
    await this.loadVisibleRow(actingUser, id)
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO mortgage_task_notes (task_id, kind, body, created_by)
         VALUES ($1, 'note', $2, $3) RETURNING id`,
        [id, data.body, actingUser.id],
      )
      await this.logActivity(client, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.NOTE_ADDED, {
        note_id: inserted.rows[0].id,
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    const notes = await this.fetchNotes(id)
    return notes[notes.length - 1]
  },

  async updateNote(
    actingUser: AuthUser,
    id: string,
    noteId: string,
    data: UpdateMortgageTaskNoteRequest,
  ): Promise<MortgageTaskNote> {
    await this.loadVisibleRow(actingUser, id)
    // Plain notes only, edited by their author.
    const updated = await db.query(
      `UPDATE mortgage_task_notes SET body = $1
       WHERE id = $2 AND task_id = $3 AND kind = 'note'
         AND created_by = $4 AND is_deleted = FALSE
       RETURNING id`,
      [data.body, noteId, id, actingUser.id],
    )
    if (updated.rows.length === 0) {
      throw new AppError(mortgageTaskMessages.NOTE_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    await this.logActivity(db, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.NOTE_UPDATED, {
      note_id: noteId,
    })
    const notes = await this.fetchNotes(id)
    return notes.find((n) => n.id === noteId)!
  },

  async deleteNote(actingUser: AuthUser, id: string, noteId: string): Promise<void> {
    await this.loadVisibleRow(actingUser, id)
    const deleted = await db.query(
      `UPDATE mortgage_task_notes SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $4
       WHERE id = $1 AND task_id = $2 AND kind = 'note'
         AND created_by = $3 AND is_deleted = FALSE
       RETURNING id`,
      [noteId, id, actingUser.id, actingUser.id],
    )
    if (deleted.rows.length === 0) {
      throw new AppError(mortgageTaskMessages.NOTE_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    await this.logActivity(db, id, actingUser.id, MORTGAGE_TASK_ACTIVITY_ACTIONS.NOTE_DELETED, {
      note_id: noteId,
    })
  },

  // ── ACTIVITY (gated by VIEW_ACTIVITY at the route; caller must see the task) ──
  async listActivity(actingUser: AuthUser, id: string): Promise<MortgageTaskActivityListResponse> {
    await this.loadVisibleRow(actingUser, id)
    const result = await db.query(
      `SELECT ac.id, ac.action, ac.detail, ac.actor_id,
              CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS actor_name,
              ac.created_at
       FROM mortgage_task_activity ac
       LEFT JOIN members a ON a.id = ac.actor_id
       WHERE ac.task_id = $1
       ORDER BY ac.created_at ASC, ac.id ASC`,
      [id],
    )
    return { items: result.rows }
  },
}
