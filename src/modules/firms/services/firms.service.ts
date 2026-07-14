import { db } from '../../../lib/db'
import { firmMessages } from '../config/firms.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  Firm,
  FirmListResponse,
  CreateFirmRequest,
  UpdateFirmRequest,
  ConcernPersonInput,
  ConcernPerson,
} from '../types/firms.types'
import type { DepartmentCode } from '../../../config/departments.constants'

// Normalize concern-person input to the stored shape (explicit nulls).
function normalizeConcernPersons(list: ConcernPersonInput[]): ConcernPerson[] {
  return list.map((p) => ({
    name: p.name.trim(),
    designation: p.designation ?? null,
    membership_number: p.membership_number ?? null,
    tax_agent_number: p.tax_agent_number ?? null,
    asic_agent_id: p.asic_agent_id ?? null,
  }))
}

const SELECT_COLUMNS = `id, department, name, description, address, email,
                        contact_no, concern_persons, is_active,
                        created_at, updated_at`

export const firmService = {
  // Trimmed firm options for the tax-client add / edit / list-filter dropdowns.
  // Scoped to the member's OWN accessible Tax Practice firms (active only) — a
  // member must never create/see a client in a firm they can't access. Access is
  // detached from FIRM.READ — the route gates it on the tax-client permission
  // instead (Luminique "for" pattern).
  async forTaxClient(memberId: string): Promise<{ items: { id: string; name: string }[] }> {
    const result = await db.query(
      `SELECT f.id, f.name
       FROM member_firms mf
       JOIN firms f ON f.id = mf.firm_id
        AND f.is_deleted = FALSE AND f.department = 'tax_practice' AND f.is_active = TRUE
       WHERE mf.member_id = $1
       ORDER BY f.name ASC`,
      [memberId],
    )
    return { items: result.rows }
  },

  // List non-deleted firms with member-access counts. Optionally filter by department.
  async list(department?: DepartmentCode): Promise<FirmListResponse> {
    const params: any[] = []
    let where = 'f.is_deleted = FALSE'
    if (department) {
      params.push(department)
      where += ` AND f.department = $${params.length}`
    }

    const result = await db.query(
      `SELECT f.id, f.department, f.name, f.description, f.address, f.email,
              f.contact_no, f.concern_persons, f.is_active,
              f.created_at, f.updated_at,
              COUNT(m.id) FILTER (WHERE m.is_deleted = FALSE)::int AS member_count
       FROM firms f
       LEFT JOIN member_firms mf ON mf.firm_id = f.id
       LEFT JOIN members m ON m.id = mf.member_id
       WHERE ${where}
       GROUP BY f.id
       ORDER BY f.name ASC`,
      params,
    )

    return { items: result.rows }
  },

  async getById(id: string): Promise<Firm> {
    const result = await db.query(
      `SELECT ${SELECT_COLUMNS} FROM firms WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(firmMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // How many non-deleted members currently have access to this firm.
  async memberCount(id: string): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM member_firms mf
       JOIN members m ON m.id = mf.member_id
       WHERE mf.firm_id = $1 AND m.is_deleted = FALSE`,
      [id],
    )
    return result.rows[0].count
  },

  async create(data: CreateFirmRequest): Promise<Firm> {
    // Firm names are unique within a department (among non-deleted firms).
    const existing = await db.query(
      `SELECT id FROM firms
       WHERE department = $1 AND LOWER(name) = LOWER($2) AND is_deleted = FALSE`,
      [data.department, data.name],
    )
    if (existing.rows.length > 0) {
      throw new AppError(firmMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }

    const result = await db.query(
      `INSERT INTO firms (
         department, name, description, address, email, contact_no,
         concern_persons, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id`,
      [
        data.department,
        data.name,
        data.description ?? null,
        data.address ?? null,
        data.email ?? null,
        data.contact_no ?? null,
        JSON.stringify(normalizeConcernPersons(data.concern_persons)),
        data.is_active,
      ],
    )

    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateFirmRequest): Promise<Firm> {
    const current = await this.getById(id) // 404s if missing/deleted

    // If renaming, the new name must be unique within the firm's department.
    if (data.name !== undefined) {
      const clash = await db.query(
        `SELECT id FROM firms
         WHERE department = $1 AND LOWER(name) = LOWER($2) AND id != $3 AND is_deleted = FALSE`,
        [current.department, data.name, id],
      )
      if (clash.rows.length > 0) {
        throw new AppError(firmMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
      }
    }

    const updates: string[] = []
    const values: any[] = []
    let i = 1

    const setField = (col: string, val: any) => {
      updates.push(`${col} = $${i++}`)
      values.push(val)
    }

    if (data.name !== undefined) setField('name', data.name)
    if (data.description !== undefined) setField('description', data.description ?? null)
    if (data.address !== undefined) setField('address', data.address ?? null)
    if (data.email !== undefined) setField('email', data.email ?? null)
    if (data.contact_no !== undefined) setField('contact_no', data.contact_no ?? null)
    if (data.concern_persons !== undefined) {
      updates.push(`concern_persons = $${i++}::jsonb`)
      values.push(JSON.stringify(normalizeConcernPersons(data.concern_persons)))
    }
    if (data.is_active !== undefined) setField('is_active', data.is_active)

    if (updates.length === 0) return this.getById(id)

    values.push(id)
    await db.query(`UPDATE firms SET ${updates.join(', ')} WHERE id = $${i}`, values)

    return this.getById(id)
  },

  // Soft-delete. Blocked while any member still has access — reassign first.
  async delete(id: string, deletedBy: string): Promise<void> {
    await this.getById(id) // 404s if missing/deleted

    const count = await this.memberCount(id)
    if (count > 0) {
      throw new AppError(
        `This firm is assigned to ${count} member${count === 1 ? '' : 's'}. Remove their access first, then delete this firm.`,
        HTTP_STATUS.CONFLICT,
      )
    }

    await db.query(
      `UPDATE firms
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
       WHERE id = $1`,
      [id, deletedBy],
    )
  },
}
