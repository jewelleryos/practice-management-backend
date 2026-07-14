import { db } from '../../../lib/db'
import { relationTypeMessages } from '../config/relation-types.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  RelationType,
  RelationTypeListResponse,
  CreateRelationTypeRequest,
  UpdateRelationTypeRequest,
} from '../types/relation-types.types'

const COLUMNS = 'id, name, description, created_at, updated_at'

export const relationTypeService = {
  // List non-deleted relation types, alphabetical by name.
  async list(): Promise<RelationTypeListResponse> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM relation_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed options for the tax-client add / edit dropdowns. Access is detached
  // from RELATION_TYPE.READ — the route gates it on the tax-client permission
  // instead (Luminique "for" pattern).
  async forTaxClient(): Promise<{ items: { id: string; name: string }[] }> {
    const result = await db.query(
      `SELECT id, name FROM relation_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<RelationType> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM relation_types WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(relationTypeMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique among non-deleted rows (case-insensitive).
  async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const params: any[] = [name]
    let sql = `SELECT id FROM relation_types WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(relationTypeMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  async create(data: CreateRelationTypeRequest): Promise<RelationType> {
    await this.assertNameAvailable(data.name)
    const result = await db.query(
      `INSERT INTO relation_types (name, description) VALUES ($1, $2) RETURNING id`,
      [data.name, data.description ?? null],
    )
    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateRelationTypeRequest): Promise<RelationType> {
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
    await db.query(`UPDATE relation_types SET ${updates.join(', ')} WHERE id = $${i}`, values)
    return this.getById(id)
  },
}
