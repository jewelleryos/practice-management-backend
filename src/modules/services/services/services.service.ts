import { db } from '../../../lib/db'
import { serviceMessages } from '../config/services.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type { DepartmentCode } from '../../../config/departments.constants'
import type {
  Service,
  ServiceListResponse,
  CreateServiceRequest,
  UpdateServiceRequest,
} from '../types/services.types'

const COLUMNS =
  'id, department, name, code, description, frequencies, auto_added, created_at, updated_at'

export const serviceService = {
  // List non-deleted services, alphabetical by name. Optionally filter by department.
  async list(department?: DepartmentCode): Promise<ServiceListResponse> {
    const params: any[] = []
    let where = 'is_deleted = FALSE'
    if (department) {
      params.push(department)
      where += ` AND department = $${params.length}`
    }
    const result = await db.query(
      `SELECT ${COLUMNS} FROM services WHERE ${where} ORDER BY name ASC`,
      params,
    )
    return { items: result.rows }
  },

  // Trimmed Tax Practice service options (with the allowed frequencies the form
  // needs to drive its frequency dropdown) for the tax-client add / edit form.
  // Access is detached from SERVICE.READ — the route gates it on the tax-client
  // permission instead (Luminique "for" pattern).
  async forTaxClient(): Promise<{
    items: {
      id: string
      name: string
      code: string | null
      frequencies: string[]
      auto_added: boolean
    }[]
  }> {
    const result = await db.query(
      `SELECT id, name, code, frequencies, auto_added FROM services
       WHERE is_deleted = FALSE AND department = 'tax_practice' ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed service options for the Service Checklists admin screen (filter +
  // add dropdown). Access is detached from SERVICE.READ — the route gates it on
  // SERVICE_CHECKLIST.READ instead, so a checklist-only admin without service
  // view access can still pick a service (Luminique "for" pattern).
  async forServiceChecklist(): Promise<{
    items: { id: string; name: string; code: string; department: DepartmentCode }[]
  }> {
    const result = await db.query(
      `SELECT id, name, code, department FROM services
       WHERE is_deleted = FALSE ORDER BY department ASC, name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<Service> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM services WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(serviceMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique within a department (case-insensitive).
  async assertNameAvailable(
    department: DepartmentCode,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const params: any[] = [department, name]
    let sql = `SELECT id FROM services WHERE department = $1 AND LOWER(name) = LOWER($2) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $3`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(serviceMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  // Code is unique within a department (case-insensitive).
  async assertCodeAvailable(
    department: DepartmentCode,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const params: any[] = [department, code]
    let sql = `SELECT id FROM services WHERE department = $1 AND LOWER(code) = LOWER($2) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $3`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(serviceMessages.CODE_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  async create(data: CreateServiceRequest): Promise<Service> {
    await this.assertNameAvailable(data.department, data.name)
    await this.assertCodeAvailable(data.department, data.code)
    const result = await db.query(
      `INSERT INTO services (department, name, code, description, frequencies, auto_added)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        data.department,
        data.name,
        data.code,
        data.description ?? null,
        data.frequencies,
        data.auto_added ?? false,
      ],
    )
    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateServiceRequest): Promise<Service> {
    const current = await this.getById(id) // 404s if missing/deleted
    // Department is fixed at creation; uniqueness is re-checked within it.
    if (data.name !== undefined) await this.assertNameAvailable(current.department, data.name, id)
    if (data.code !== undefined) await this.assertCodeAvailable(current.department, data.code, id)

    const updates: string[] = []
    const values: any[] = []
    let i = 1
    if (data.name !== undefined) {
      updates.push(`name = $${i++}`)
      values.push(data.name)
    }
    if (data.code !== undefined) {
      updates.push(`code = $${i++}`)
      values.push(data.code)
    }
    if (data.description !== undefined) {
      updates.push(`description = $${i++}`)
      values.push(data.description ?? null)
    }
    if (data.frequencies !== undefined) {
      updates.push(`frequencies = $${i++}`)
      values.push(data.frequencies)
    }
    if (data.auto_added !== undefined) {
      updates.push(`auto_added = $${i++}`)
      values.push(data.auto_added)
    }
    if (updates.length === 0) return this.getById(id)

    values.push(id)
    await db.query(`UPDATE services SET ${updates.join(', ')} WHERE id = $${i}`, values)
    return this.getById(id)
  },
}
