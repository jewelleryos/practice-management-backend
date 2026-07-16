import { db } from '../../../lib/db'
import { loanTypeMessages } from '../config/loan-types.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  LoanType,
  LoanTypeListResponse,
  CreateLoanTypeRequest,
  UpdateLoanTypeRequest,
} from '../types/loan-types.types'

const COLUMNS = 'id, name, description, created_at, updated_at'

export const loanTypeService = {
  // List non-deleted loan types, alphabetical by name.
  async list(): Promise<LoanTypeListResponse> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM loan_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed options for the mortgage-task create form. Access is detached from
  // LOAN_TYPE.READ — the route gates it on the mortgage-task action instead
  // (Luminique "for" pattern).
  async forMortgageTask(): Promise<{ items: { id: string; name: string }[] }> {
    const result = await db.query(
      `SELECT id, name FROM loan_types WHERE is_deleted = FALSE ORDER BY name ASC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<LoanType> {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM loan_types WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(loanTypeMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Name is unique among non-deleted rows (case-insensitive).
  async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const params: any[] = [name]
    let sql = `SELECT id FROM loan_types WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(loanTypeMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  async create(data: CreateLoanTypeRequest): Promise<LoanType> {
    await this.assertNameAvailable(data.name)
    const result = await db.query(
      `INSERT INTO loan_types (name, description) VALUES ($1, $2) RETURNING id`,
      [data.name, data.description ?? null],
    )
    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateLoanTypeRequest): Promise<LoanType> {
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
    await db.query(`UPDATE loan_types SET ${updates.join(', ')} WHERE id = $${i}`, values)
    return this.getById(id)
  },
}
