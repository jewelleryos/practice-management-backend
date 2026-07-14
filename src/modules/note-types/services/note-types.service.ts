import { db } from '../../../lib/db'
import { noteTypeMessages } from '../config/note-types.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  NoteType,
  NoteTypeListResponse,
  CreateNoteTypeRequest,
  UpdateNoteTypeRequest,
} from '../types/note-types.types'

const COLUMNS = 'id, name, description, is_sensitive, created_at, updated_at'

export const noteTypeService = {
  // List non-deleted note types, alphabetical by name.
  async list(): Promise<NoteTypeListResponse> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM note_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed options for the tax-client add / edit note dropdowns. Includes
  // is_sensitive so the form can badge sensitive types. Access is detached from
  // NOTE_TYPE.READ — the route gates it on the tax-client permission instead
  // (Luminique "for" pattern).
  async forTaxClient(): Promise<{ items: { id: string; name: string; is_sensitive: boolean }[] }> {
    const result = await db.query(
      `SELECT id, name, is_sensitive FROM note_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<NoteType> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM note_types WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(noteTypeMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique among non-deleted rows (case-insensitive).
  async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const params: any[] = [name]
    let sql = `SELECT id FROM note_types WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(noteTypeMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  async create(data: CreateNoteTypeRequest): Promise<NoteType> {
    await this.assertNameAvailable(data.name)
    const result = await db.query(
      `INSERT INTO note_types (name, description, is_sensitive) VALUES ($1, $2, $3) RETURNING id`,
      [data.name, data.description ?? null, data.is_sensitive],
    )
    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateNoteTypeRequest): Promise<NoteType> {
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
    if (data.is_sensitive !== undefined) {
      updates.push(`is_sensitive = $${i++}`)
      values.push(data.is_sensitive)
    }
    if (updates.length === 0) return this.getById(id)

    values.push(id)
    await db.query(`UPDATE note_types SET ${updates.join(', ')} WHERE id = $${i}`, values)
    return this.getById(id)
  },
}
