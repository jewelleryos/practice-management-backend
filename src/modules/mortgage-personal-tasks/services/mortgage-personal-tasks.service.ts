import { db } from '../../../lib/db'
import { mortgagePersonalTaskMessages } from '../config/mortgage-personal-tasks.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { DEPARTMENTS } from '../../../config/departments.constants'
import type { TaskStatus } from '../../../config/task-statuses.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import type {
  CreatePersonalTaskRequest,
  UpdatePersonalTaskRequest,
  CreateNoteRequest,
  UpdateNoteRequest,
  ListPersonalTasksQuery,
  PersonalTaskListItem,
  PersonalTaskListResponse,
  PersonalTaskDetail,
  PersonalTaskNote,
  PersonalTaskMemberOption,
} from '../types/mortgage-personal-tasks.types'

// A task row + its embedded followers + note count, joined with the creator name.
// `t` = mortgage_personal_tasks. Used by both list and getById.
const ROW_SELECT = `
  t.id, t.title, t.description, t.status, t.due_date,
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
    FROM mortgage_personal_task_followers f
    JOIN members fm ON fm.id = f.member_id
    WHERE f.task_id = t.id
  ), '[]'::json) AS followers,
  (SELECT COUNT(*)::int
     FROM mortgage_personal_task_notes n
    WHERE n.task_id = t.id AND n.is_deleted = FALSE) AS note_count`

const ROW_JOINS = `
  FROM mortgage_personal_tasks t
  LEFT JOIN members cb ON cb.id = t.created_by`

// The visibility predicate: the caller is the creator OR a follower of the task.
// $1 must be the caller's member id. Used everywhere a task is read/written.
const VISIBLE_PREDICATE = `(
  t.created_by = $1
  OR EXISTS (
    SELECT 1 FROM mortgage_personal_task_followers f
    WHERE f.task_id = t.id AND f.member_id = $1
  )
)`

function mapRow(row: any): PersonalTaskListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    due_date: row.due_date,
    created_by: row.created_by,
    creator_name: row.creator_name,
    followers: row.followers ?? [],
    note_count: row.note_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const mortgagePersonalTaskService = {
  // ── LIST (scoped to creator-or-follower, filtered, sorted, paginated) ──
  async list(actingUser: AuthUser, q: ListPersonalTasksQuery): Promise<PersonalTaskListResponse> {
    const params: any[] = [actingUser.id]
    const where: string[] = ['t.is_deleted = FALSE', VISIBLE_PREDICATE]

    if (q.status) {
      params.push(q.status)
      where.push(`t.status = $${params.length}`)
    }
    if (q.follower_id) {
      params.push(q.follower_id)
      where.push(
        `EXISTS (SELECT 1 FROM mortgage_personal_task_followers f2
                 WHERE f2.task_id = t.id AND f2.member_id = $${params.length})`,
      )
    }
    if (q.search) {
      params.push(`%${q.search}%`)
      where.push(`t.title ILIKE $${params.length}`)
    }

    const whereSql = where.join(' AND ')
    const orderCol = q.sort_by === 'due_date' ? 't.due_date' : 't.created_at'
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
       ORDER BY ${orderCol} ${orderDir} NULLS LAST, t.id DESC
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
  async getById(actingUser: AuthUser, id: string): Promise<PersonalTaskDetail> {
    const result = await db.query(
      `SELECT ${ROW_SELECT} ${ROW_JOINS}
       WHERE t.id = $2 AND t.is_deleted = FALSE AND ${VISIBLE_PREDICATE}`,
      [actingUser.id, id],
    )
    if (result.rows.length === 0) {
      throw new AppError(mortgagePersonalTaskMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    const notes = await this.fetchNotes(id)
    return { ...mapRow(result.rows[0]), notes }
  },

  // Ensures the caller can see the task (creator or follower); throws 404 if not.
  async assertVisible(actingUser: AuthUser, id: string): Promise<{ created_by: string }> {
    const result = await db.query(
      `SELECT t.created_by
       FROM mortgage_personal_tasks t
       WHERE t.id = $2 AND t.is_deleted = FALSE AND ${VISIBLE_PREDICATE}`,
      [actingUser.id, id],
    )
    if (result.rows.length === 0) {
      throw new AppError(mortgagePersonalTaskMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return { created_by: result.rows[0].created_by }
  },

  async fetchNotes(taskId: string): Promise<PersonalTaskNote[]> {
    const result = await db.query(
      `SELECT n.id, n.body, n.created_by,
              CASE WHEN m.id IS NULL THEN NULL ELSE m.first_name || ' ' || m.last_name END AS created_by_name,
              (n.updated_at > n.created_at) AS edited,
              n.created_at, n.updated_at
       FROM mortgage_personal_task_notes n
       LEFT JOIN members m ON m.id = n.created_by
       WHERE n.task_id = $1 AND n.is_deleted = FALSE
       ORDER BY n.created_at ASC`,
      [taskId],
    )
    return result.rows as PersonalTaskNote[]
  },

  // Validate + normalise a follower id list: dedupe, drop the creator, and confirm
  // each is a real, active member. Returns the cleaned id list.
  async normaliseFollowers(followerIds: string[], creatorId: string): Promise<string[]> {
    const ids = [...new Set(followerIds)].filter((id) => id !== creatorId)
    if (ids.length === 0) return []
    const result = await db.query(
      `SELECT id FROM members WHERE id = ANY($1) AND is_deleted = FALSE`,
      [ids],
    )
    if (result.rows.length !== ids.length) {
      throw new AppError(mortgagePersonalTaskMessages.FOLLOWER_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
    return ids
  },

  // ── CREATE ──
  async create(actingUser: AuthUser, data: CreatePersonalTaskRequest): Promise<PersonalTaskDetail> {
    const followerIds = await this.normaliseFollowers(data.follower_ids, actingUser.id)

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      const inserted = await client.query(
        `INSERT INTO mortgage_personal_tasks (title, description, status, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [data.title, data.description ?? null, data.status, data.due_date ?? null, actingUser.id],
      )
      const taskId = inserted.rows[0].id as string

      for (const memberId of followerIds) {
        await client.query(
          `INSERT INTO mortgage_personal_task_followers (task_id, member_id) VALUES ($1, $2)`,
          [taskId, memberId],
        )
      }

      await client.query('COMMIT')
      return this.getById(actingUser, taskId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── UPDATE fields (title / description / status / due_date) ──
  async update(
    actingUser: AuthUser,
    id: string,
    data: UpdatePersonalTaskRequest,
  ): Promise<PersonalTaskDetail> {
    await this.assertVisible(actingUser, id)

    const sets: string[] = []
    const params: any[] = []
    if (data.title !== undefined) {
      params.push(data.title)
      sets.push(`title = $${params.length}`)
    }
    if (data.description !== undefined) {
      params.push(data.description ?? null)
      sets.push(`description = $${params.length}`)
    }
    if (data.status !== undefined) {
      params.push(data.status)
      sets.push(`status = $${params.length}`)
    }
    if (data.due_date !== undefined) {
      params.push(data.due_date ?? null)
      sets.push(`due_date = $${params.length}`)
    }

    if (sets.length > 0) {
      params.push(id)
      await db.query(
        `UPDATE mortgage_personal_tasks SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      )
    }
    return this.getById(actingUser, id)
  },

  // ── CHANGE STATUS (board drag) — any viewer may move it ──
  async changeStatus(
    actingUser: AuthUser,
    id: string,
    status: TaskStatus,
  ): Promise<PersonalTaskDetail> {
    await this.assertVisible(actingUser, id)
    await db.query(`UPDATE mortgage_personal_tasks SET status = $1 WHERE id = $2`, [status, id])
    return this.getById(actingUser, id)
  },

  // ── REPLACE the follower set (add/remove; creator + followers can do this) ──
  async setFollowers(
    actingUser: AuthUser,
    id: string,
    followerIds: string[],
  ): Promise<PersonalTaskDetail> {
    const { created_by } = await this.assertVisible(actingUser, id)
    const ids = await this.normaliseFollowers(followerIds, created_by)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM mortgage_personal_task_followers WHERE task_id = $1`, [id])
      for (const memberId of ids) {
        await client.query(
          `INSERT INTO mortgage_personal_task_followers (task_id, member_id) VALUES ($1, $2)`,
          [id, memberId],
        )
      }
      await client.query(`UPDATE mortgage_personal_tasks SET updated_at = NOW() WHERE id = $1`, [id])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return this.getById(actingUser, id)
  },

  // ── NOTES ──
  async listNotes(actingUser: AuthUser, id: string): Promise<PersonalTaskNote[]> {
    await this.assertVisible(actingUser, id)
    return this.fetchNotes(id)
  },

  async addNote(
    actingUser: AuthUser,
    id: string,
    data: CreateNoteRequest,
  ): Promise<PersonalTaskNote> {
    await this.assertVisible(actingUser, id)
    const inserted = await db.query(
      `INSERT INTO mortgage_personal_task_notes (task_id, body, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [id, data.body, actingUser.id],
    )
    const notes = await this.fetchNotes(id)
    return notes.find((n) => n.id === inserted.rows[0].id)!
  },

  async updateNote(
    actingUser: AuthUser,
    id: string,
    noteId: string,
    data: UpdateNoteRequest,
  ): Promise<PersonalTaskNote> {
    await this.assertVisible(actingUser, id)
    // Any party (creator or follower) may edit any note on a task they can see.
    const updated = await db.query(
      `UPDATE mortgage_personal_task_notes SET body = $1
       WHERE id = $2 AND task_id = $3 AND is_deleted = FALSE
       RETURNING id`,
      [data.body, noteId, id],
    )
    if (updated.rows.length === 0) {
      throw new AppError(mortgagePersonalTaskMessages.NOTE_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    const notes = await this.fetchNotes(id)
    return notes.find((n) => n.id === noteId)!
  },

  // ── Members that can be added as followers (mortgage-department members) ──
  async memberOptions(): Promise<PersonalTaskMemberOption[]> {
    const result = await db.query(
      `SELECT id, first_name || ' ' || last_name AS name
       FROM members
       WHERE is_deleted = FALSE AND $1 = ANY(departments)
       ORDER BY first_name, last_name`,
      [DEPARTMENTS.MORTGAGE],
    )
    return result.rows as PersonalTaskMemberOption[]
  },
}
