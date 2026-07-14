import { db } from '../../../lib/db'
import { workStatusMessages } from '../config/work-statuses.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  WorkStatus,
  WorkStatusListResponse,
  CreateWorkStatusRequest,
  UpdateWorkStatusRequest,
} from '../types/work-statuses.types'

const COLUMNS = 'id, name, color, is_active, is_default, sort_order, created_at, updated_at'

export const workStatusService = {
  // List non-deleted work statuses, in display order then alphabetical.
  async list(): Promise<WorkStatusListResponse> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM work_statuses WHERE is_deleted = FALSE ORDER BY sort_order ASC, name ASC`,
    )
    return { items: result.rows }
  },

  // Active work statuses for the task create form (id, name, colour, is_default).
  // The form pre-selects the default. Gated on TAX_TASK.CREATE at the route.
  async activeForTaxTask(): Promise<{
    items: { id: string; name: string; color: string; is_default: boolean }[]
  }> {
    const result = await db.query(
      `SELECT id, name, color, is_default
       FROM work_statuses
       WHERE is_active = TRUE AND is_deleted = FALSE
       ORDER BY sort_order ASC, name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<WorkStatus> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM work_statuses WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(workStatusMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique among non-deleted rows (case-insensitive).
  async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const params: any[] = [name]
    let sql = `SELECT id FROM work_statuses WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(workStatusMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  // Next display position — appends new statuses to the end (auto-managed).
  async nextSortOrder(): Promise<number> {
    const result = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM work_statuses WHERE is_deleted = FALSE`,
    )
    return result.rows[0].next
  },

  async create(data: CreateWorkStatusRequest): Promise<WorkStatus> {
    await this.assertNameAvailable(data.name)
    const isActive = data.is_active ?? true
    const isDefault = data.is_default ?? false
    // A default must be active.
    if (isDefault && !isActive) {
      throw new AppError(workStatusMessages.DEFAULT_MUST_BE_ACTIVE, HTTP_STATUS.BAD_REQUEST)
    }
    const sortOrder = await this.nextSortOrder()

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      // Setting this as default clears any existing default first (single-default).
      if (isDefault) {
        await client.query(
          `UPDATE work_statuses SET is_default = FALSE WHERE is_default = TRUE AND is_deleted = FALSE`,
        )
      }
      const result = await client.query(
        `INSERT INTO work_statuses (name, color, is_active, is_default, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [data.name, data.color, isActive, isDefault, sortOrder],
      )
      await client.query('COMMIT')
      return this.getById(result.rows[0].id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  async update(id: string, data: UpdateWorkStatusRequest): Promise<WorkStatus> {
    const current = await this.getById(id) // 404s if missing/deleted
    if (data.name !== undefined) await this.assertNameAvailable(data.name, id)

    // Resulting flags after applying the patch.
    const newActive = data.is_active !== undefined ? data.is_active : current.is_active
    const newDefault = data.is_default !== undefined ? data.is_default : current.is_default

    // Invariant: a default work status is always active.
    if (newDefault && !newActive) {
      // Tailor the message to what the caller is actually trying to do.
      if (data.is_active === false && current.is_default) {
        // Deactivating the current default.
        throw new AppError(workStatusMessages.DEACTIVATE_DEFAULT_BLOCKED, HTTP_STATUS.BAD_REQUEST)
      }
      // Making an inactive status the default.
      throw new AppError(workStatusMessages.DEFAULT_MUST_BE_ACTIVE, HTTP_STATUS.BAD_REQUEST)
    }

    const updates: string[] = []
    const values: any[] = []
    let i = 1
    if (data.name !== undefined) {
      updates.push(`name = $${i++}`)
      values.push(data.name)
    }
    if (data.color !== undefined) {
      updates.push(`color = $${i++}`)
      values.push(data.color)
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${i++}`)
      values.push(data.is_active)
    }
    if (data.is_default !== undefined) {
      updates.push(`is_default = $${i++}`)
      values.push(data.is_default)
    }
    if (updates.length === 0) return this.getById(id)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      // Promoting to default clears any other default first (single-default).
      if (data.is_default === true) {
        await client.query(
          `UPDATE work_statuses SET is_default = FALSE
           WHERE is_default = TRUE AND is_deleted = FALSE AND id != $1`,
          [id],
        )
      }
      values.push(id)
      await client.query(`UPDATE work_statuses SET ${updates.join(', ')} WHERE id = $${i}`, values)
      await client.query('COMMIT')
      return this.getById(id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },
}
