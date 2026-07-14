import type { PoolClient } from 'pg'
import { db } from '../../../lib/db'
import { financialYearMessages } from '../config/financial-years.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  FinancialYear,
  FinancialYearListResponse,
  CreateFinancialYearRequest,
  UpdateFinancialYearRequest,
} from '../types/financial-years.types'

const SELECT_COLUMNS = `id, year, is_current, created_at, updated_at`

export const financialYearService = {
  // List non-deleted financial years. Current first, then newest-created.
  async list(): Promise<FinancialYearListResponse> {
    const result = await db.query(
      `SELECT ${SELECT_COLUMNS}
       FROM financial_years
       WHERE is_deleted = FALSE
       ORDER BY is_current DESC, created_at DESC`,
    )
    return { items: result.rows }
  },

  // Option list for the tasks module (create form + the client Tasks / Work Status
  // screens): { id, name, is_current } where name is the year label and is_current
  // marks the default selection. Current first, then newest. Served by the
  // permission-detached /for-tax-task route (not gated on FINANCIAL_YEAR.READ).
  async optionsForTaxTask(): Promise<{ items: { id: string; name: string; is_current: boolean }[] }> {
    const result = await db.query(
      `SELECT id, year AS name, is_current
       FROM financial_years
       WHERE is_deleted = FALSE
       ORDER BY is_current DESC, created_at DESC`,
    )
    return { items: result.rows }
  },

  async getById(id: string): Promise<FinancialYear> {
    const result = await db.query(
      `SELECT ${SELECT_COLUMNS} FROM financial_years WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(financialYearMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return result.rows[0]
  },

  // Year labels are unique among non-deleted rows (case-insensitive).
  async assertYearAvailable(year: string, excludeId?: string): Promise<void> {
    const params: any[] = [year]
    let sql = `SELECT id FROM financial_years WHERE LOWER(year) = LOWER($1) AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(financialYearMessages.YEAR_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  // Clear the current flag on every other non-deleted row, so only `keepId`
  // (if any) remains current. Runs inside the caller's transaction.
  async clearOtherCurrent(client: PoolClient, keepId?: string): Promise<void> {
    if (keepId) {
      await client.query(
        `UPDATE financial_years SET is_current = FALSE
         WHERE is_current = TRUE AND is_deleted = FALSE AND id != $1`,
        [keepId],
      )
    } else {
      await client.query(
        `UPDATE financial_years SET is_current = FALSE
         WHERE is_current = TRUE AND is_deleted = FALSE`,
      )
    }
  },

  async create(data: CreateFinancialYearRequest): Promise<FinancialYear> {
    await this.assertYearAvailable(data.year)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      // If this one is current, demote whichever was current before.
      if (data.is_current) await this.clearOtherCurrent(client)

      const inserted = await client.query(
        `INSERT INTO financial_years (year, is_current) VALUES ($1, $2) RETURNING id`,
        [data.year, data.is_current],
      )
      await client.query('COMMIT')
      return this.getById(inserted.rows[0].id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  async update(id: string, data: UpdateFinancialYearRequest): Promise<FinancialYear> {
    await this.getById(id) // 404s if missing/deleted

    if (data.year !== undefined) await this.assertYearAvailable(data.year, id)

    const updates: string[] = []
    const values: any[] = []
    let i = 1
    const set = (col: string, val: any) => {
      updates.push(`${col} = $${i++}`)
      values.push(val)
    }
    if (data.year !== undefined) set('year', data.year)
    if (data.is_current !== undefined) set('is_current', data.is_current)

    if (updates.length === 0) return this.getById(id)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      // Promoting this year to current demotes all others first.
      if (data.is_current === true) await this.clearOtherCurrent(client, id)

      values.push(id)
      await client.query(
        `UPDATE financial_years SET ${updates.join(', ')} WHERE id = $${i}`,
        values,
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return this.getById(id)
  },
}
