import { db } from '../../../lib/db'
import { entityTypeMessages } from '../config/entity-types.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { annualReviewService } from '../../annual-reviews/services/annual-reviews.service'
import type {
  EntityType,
  EntityTypeListResponse,
  CreateEntityTypeRequest,
  UpdateEntityTypeRequest,
} from '../types/entity-types.types'

const COLUMNS = 'id, name, description, annual_review_enabled, created_at, updated_at'

export const entityTypeService = {
  // List non-deleted entity types, alphabetical by name.
  async list(): Promise<EntityTypeListResponse> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM entity_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed options for the tax-client add / edit / list-filter dropdowns.
  // Access is detached from ENTITY_TYPE.READ — the route gates it on the
  // tax-client permission instead (Luminique "for" pattern).
  async forTaxClient(): Promise<{ items: { id: string; name: string }[] }> {
    const result = await db.query(
      `SELECT id, name FROM entity_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<EntityType> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM entity_types WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(entityTypeMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique among non-deleted rows (case-insensitive).
  async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const params: any[] = [name]
    let sql = `SELECT id FROM entity_types WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(entityTypeMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  async create(data: CreateEntityTypeRequest): Promise<EntityType> {
    await this.assertNameAvailable(data.name)
    const result = await db.query(
      `INSERT INTO entity_types (name, description, annual_review_enabled)
       VALUES ($1, $2, $3) RETURNING id`,
      [data.name, data.description ?? null, data.annual_review_enabled ?? false],
    )
    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateEntityTypeRequest): Promise<EntityType> {
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
    if (data.annual_review_enabled !== undefined) {
      updates.push(`annual_review_enabled = $${i++}`)
      values.push(data.annual_review_enabled)
    }
    if (updates.length === 0) return this.getById(id)

    values.push(id)
    await db.query(`UPDATE entity_types SET ${updates.join(', ')} WHERE id = $${i}`, values)

    // Switching the toggle ON backfills the current year immediately, so enabling
    // "Company" fills the Annual Review page straight away rather than leaving it
    // empty until Sunday. The sweep is idempotent, so doing this here costs nothing.
    //
    // Wrapped because its failure must NEVER stop an entity type being saved — the
    // weekly sweep and the page-load safety net will both pick up the slack.
    if (data.annual_review_enabled === true) {
      try {
        const year = await annualReviewService.currentYear()
        await annualReviewService.ensureAnnualReviews(year)
      } catch (err) {
        console.error('[annual-review] backfill after entity-type enable failed', err)
      }
    }

    return this.getById(id)
  },
}
