import { db } from '../../../lib/db'
import { clientGroupMessages } from '../config/client-groups.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  ClientGroup,
  ClientGroupListResponse,
  CreateClientGroupRequest,
  UpdateClientGroupRequest,
} from '../types/client-groups.types'

const COLUMNS = 'id, name, description, created_at, updated_at'

export const clientGroupService = {
  // List non-deleted client groups, alphabetical by name.
  async list(): Promise<ClientGroupListResponse> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM client_groups WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed options for the tax-client add / edit / list-filter dropdowns.
  // Access is detached from CLIENT_GROUP.READ — the route gates it on the
  // tax-client permission instead (Luminique "for" pattern).
  async forTaxClient(): Promise<{ items: { id: string; name: string }[] }> {
    const result = await db.query(
      `SELECT id, name FROM client_groups WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<ClientGroup> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM client_groups WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(clientGroupMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique among non-deleted rows (case-insensitive).
  async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const params: any[] = [name]
    let sql = `SELECT id FROM client_groups WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(clientGroupMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  async create(data: CreateClientGroupRequest): Promise<ClientGroup> {
    await this.assertNameAvailable(data.name)
    const result = await db.query(
      `INSERT INTO client_groups (name, description) VALUES ($1, $2) RETURNING id`,
      [data.name, data.description ?? null],
    )
    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateClientGroupRequest): Promise<ClientGroup> {
    await this.getById(id) // 404s if missing/deleted
    if (data.name !== undefined) await this.assertNameAvailable(data.name, id)

    const updates: string[] = []
    const values: any[] = []
    let i = 1
    if (data.name !== undefined) {
      updates.push(`name = $${i++}`)
      values.push(data.name)
    }
    if (data.description !== undefined) {
      updates.push(`description = $${i++}`)
      values.push(data.description ?? null)
    }
    if (updates.length === 0) return this.getById(id)

    values.push(id)
    await db.query(`UPDATE client_groups SET ${updates.join(', ')} WHERE id = $${i}`, values)
    return this.getById(id)
  },
}
