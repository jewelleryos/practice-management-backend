import { db } from '../../../lib/db'
import { serviceChecklistMessages } from '../config/service-checklists.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  ServiceChecklistItem,
  ServiceChecklistListResponse,
  CreateServiceChecklistItemRequest,
  UpdateServiceChecklistItemRequest,
} from '../types/service-checklists.types'

const COLUMNS =
  'id, service_id, heading, description, is_required, is_active, sort_order, created_at, updated_at'

export const serviceChecklistService = {
  // Every non-deleted checklist item across all services, each joined with its
  // service name/code. Flat list for the admin table; the frontend filters by
  // service. Ordered by service name, then sort_order, then heading.
  async list(): Promise<ServiceChecklistListResponse> {
    const result = await db.query(
      `SELECT sci.id, sci.service_id, s.name AS service_name, s.code AS service_code,
              sci.heading, sci.description, sci.is_required, sci.is_active,
              sci.sort_order, sci.created_at, sci.updated_at
       FROM service_checklist_items sci
       JOIN services s ON s.id = sci.service_id AND s.is_deleted = FALSE
       WHERE sci.is_deleted = FALSE
       ORDER BY s.name ASC, sci.sort_order ASC, sci.heading ASC`,
    )
    return { items: result.rows }
  },

  // A service's ACTIVE checklist items — the ones copied onto a task at creation.
  // Used by the task create form to preview what will be attached. Returns just
  // the display fields, ordered like the master (sort_order, then heading).
  async activeForService(
    serviceId: string,
  ): Promise<{ items: { id: string; heading: string; description: string | null; is_required: boolean }[] }> {
    const result = await db.query(
      `SELECT id, heading, description, is_required
       FROM service_checklist_items
       WHERE service_id = $1 AND is_active = TRUE AND is_deleted = FALSE
       ORDER BY sort_order ASC, heading ASC`,
      [serviceId],
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<ServiceChecklistItem> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM service_checklist_items WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(serviceChecklistMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // The service must exist and not be deleted.
  async assertServiceExists(serviceId: string): Promise<void> {
    const result = await db.query(
      `SELECT id FROM services WHERE id = $1 AND is_deleted = FALSE`,
      [serviceId],
    )
    if (result.rows.length === 0) {
      throw new AppError(serviceChecklistMessages.SERVICE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
  },

  // Heading is unique within a service (case-insensitive).
  async assertHeadingAvailable(
    serviceId: string,
    heading: string,
    excludeId?: string,
  ): Promise<void> {
    const params: any[] = [serviceId, heading]
    let sql = `SELECT id FROM service_checklist_items
               WHERE service_id = $1 AND LOWER(heading) = LOWER($2) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $3`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(serviceChecklistMessages.HEADING_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  // Next sort_order for a service = current max + 1 (new items append to the end).
  // sort_order isn't set through the form yet; a reorder flow can manage it later.
  async nextSortOrder(serviceId: string): Promise<number> {
    const result = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM service_checklist_items WHERE service_id = $1 AND is_deleted = FALSE`,
      [serviceId],
    )
    return result.rows[0].next
  },

  async create(data: CreateServiceChecklistItemRequest): Promise<ServiceChecklistItem> {
    await this.assertServiceExists(data.service_id)
    await this.assertHeadingAvailable(data.service_id, data.heading)
    const sortOrder = await this.nextSortOrder(data.service_id)
    const result = await db.query(
      `INSERT INTO service_checklist_items (service_id, heading, description, is_required, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        data.service_id,
        data.heading,
        data.description ?? null,
        data.is_required ?? false,
        data.is_active ?? true,
        sortOrder,
      ],
    )
    return this.getById(result.rows[0].id)
  },

  async update(
    id: string,
    data: UpdateServiceChecklistItemRequest,
  ): Promise<ServiceChecklistItem> {
    const current = await this.getById(id) // 404s if missing/deleted
    // Service is fixed at creation; heading uniqueness is re-checked within it.
    if (data.heading !== undefined) {
      await this.assertHeadingAvailable(current.service_id, data.heading, id)
    }

    const updates: string[] = []
    const values: any[] = []
    let i = 1
    if (data.heading !== undefined) {
      updates.push(`heading = $${i++}`)
      values.push(data.heading)
    }
    if (data.description !== undefined) {
      updates.push(`description = $${i++}`)
      values.push(data.description ?? null)
    }
    if (data.is_required !== undefined) {
      updates.push(`is_required = $${i++}`)
      values.push(data.is_required)
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${i++}`)
      values.push(data.is_active)
    }
    if (updates.length === 0) return this.getById(id)

    values.push(id)
    await db.query(
      `UPDATE service_checklist_items SET ${updates.join(', ')} WHERE id = $${i}`,
      values,
    )
    return this.getById(id)
  },
}
