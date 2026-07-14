import type { PoolClient } from 'pg'
import { db } from '../../../lib/db'
import { memberMessages } from '../config/members.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { computeEffectivePermissions } from '../../../utils/permissions'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { DepartmentCode } from '../../../config/departments.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import type {
  MemberListResponse,
  MemberDetail,
  CreateMemberRequest,
  UpdateMemberRequest,
} from '../types/members.types'

const BCRYPT_COST = 12

const uniqueStrings = <T extends string>(arr: T[]): T[] => [...new Set(arr)]
const normalizeCodes = (arr: number[]): number[] => [...new Set(arr)].sort((a, b) => a - b)

const hashPassword = (plain: string): Promise<string> =>
  Bun.password.hash(plain, { algorithm: 'bcrypt', cost: BCRYPT_COST })

export const memberService = {
  // List all non-deleted members with role name, departments and firm counts.
  async list(): Promise<MemberListResponse> {
    const result = await db.query(
      `SELECT m.id, m.email, m.first_name, m.last_name, m.phone,
              m.role_id, r.name AS role_name,
              m.departments, m.is_active, m.last_login_at,
              m.created_at, m.updated_at,
              COUNT(f.id)::int AS firm_count
       FROM members m
       LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = FALSE
       LEFT JOIN member_firms mf ON mf.member_id = m.id
       LEFT JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE
       WHERE m.is_deleted = FALSE
       GROUP BY m.id, r.name
       ORDER BY m.first_name ASC, m.last_name ASC`,
    )
    return { items: result.rows }
  },

  // Trimmed active-member options (id + full name) for the tax-client assignee
  // dropdowns. Access is detached from MEMBER.READ — the route gates it on the
  // tax-client permission instead (Luminique "for" pattern).
  async forTaxClient(): Promise<{ items: { id: string; name: string }[] }> {
    const result = await db.query(
      `SELECT id, (first_name || ' ' || last_name) AS name
       FROM members
       WHERE is_deleted = FALSE AND is_active = TRUE
       ORDER BY first_name ASC, last_name ASC`,
    )
    return { items: result.rows }
  },

  // Full detail for one member, including their firms and effective permissions.
  async getById(id: string): Promise<MemberDetail> {
    const result = await db.query(
      `SELECT m.id, m.email, m.first_name, m.last_name, m.phone, m.photo_url,
              m.role_id, r.name AS role_name, COALESCE(r.permissions, '{}') AS role_permissions,
              m.departments, m.extra_permissions, m.revoked_permissions,
              m.is_active, m.last_login_at, m.created_at, m.updated_at
       FROM members m
       LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = FALSE
       WHERE m.id = $1 AND m.is_deleted = FALSE`,
      [id],
    )
    const row = result.rows[0]
    if (!row) {
      throw new AppError(memberMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }

    const firmsResult = await db.query(
      `SELECT f.id, f.name, f.department
       FROM member_firms mf
       JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE
       WHERE mf.member_id = $1
       ORDER BY f.name ASC`,
      [id],
    )

    const departments: DepartmentCode[] = row.departments || []
    const extra: number[] = row.extra_permissions || []
    const revoked: number[] = row.revoked_permissions || []

    return {
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      photo_url: row.photo_url,
      role_id: row.role_id,
      role_name: row.role_name,
      departments,
      firms: firmsResult.rows,
      extra_permissions: extra,
      revoked_permissions: revoked,
      effective_permissions: computeEffectivePermissions(
        row.role_permissions || [],
        extra,
        revoked,
        departments,
      ),
      is_active: row.is_active,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  },

  // ── Validation helpers ──

  // Email must be unique among non-deleted members (optionally excluding one id).
  async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const params: any[] = [email]
    let sql = `SELECT id FROM members WHERE email = $1 AND is_deleted = FALSE`
    if (excludeId) {
      params.push(excludeId)
      sql += ` AND id != $2`
    }
    const result = await db.query(sql, params)
    if (result.rows.length > 0) {
      throw new AppError(memberMessages.EMAIL_EXISTS, HTTP_STATUS.CONFLICT)
    }
  },

  // The assigned role must exist and not be soft-deleted.
  async assertRoleExists(roleId: string): Promise<void> {
    const result = await db.query(
      `SELECT id FROM roles WHERE id = $1 AND is_deleted = FALSE`,
      [roleId],
    )
    if (result.rows.length === 0) {
      throw new AppError(memberMessages.ROLE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
  },

  // Every firm must exist and belong to a department the member has access to.
  async assertFirmsValid(firmIds: string[], departments: DepartmentCode[]): Promise<void> {
    const ids = uniqueStrings(firmIds)
    if (ids.length === 0) return

    const result = await db.query(
      `SELECT id, department FROM firms WHERE id = ANY($1) AND is_deleted = FALSE`,
      [ids],
    )
    if (result.rows.length !== ids.length) {
      throw new AppError(memberMessages.FIRM_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }

    const allowed = new Set<string>(departments)
    for (const firm of result.rows) {
      if (!allowed.has(firm.department)) {
        throw new AppError(memberMessages.FIRM_DEPARTMENT_MISMATCH, HTTP_STATUS.BAD_REQUEST)
      }
    }
  },

  // Reconcile a member's firm access to exactly `firmIds` (within a transaction).
  async replaceFirms(client: PoolClient, memberId: string, firmIds: string[]): Promise<void> {
    await client.query(`DELETE FROM member_firms WHERE member_id = $1`, [memberId])
    for (const firmId of uniqueStrings(firmIds)) {
      await client.query(
        `INSERT INTO member_firms (member_id, firm_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [memberId, firmId],
      )
    }
  },

  async create(data: CreateMemberRequest): Promise<MemberDetail> {
    await this.assertEmailAvailable(data.email)
    await this.assertRoleExists(data.role_id)

    const departments = uniqueStrings(data.departments)
    await this.assertFirmsValid(data.firm_ids, departments)

    const hashed = await hashPassword(data.password)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO members (
           email, first_name, last_name, phone, password, role_id,
           extra_permissions, revoked_permissions, departments
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          data.email,
          data.first_name,
          data.last_name,
          data.phone ?? null,
          hashed,
          data.role_id,
          normalizeCodes(data.extra_permissions),
          normalizeCodes(data.revoked_permissions),
          departments,
        ],
      )
      const memberId = inserted.rows[0].id
      await this.replaceFirms(client, memberId, data.firm_ids)
      await client.query('COMMIT')
      return this.getById(memberId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // Partial update. `actingUser` is the member making the change — used to gate
  // editing one's OWN role/permissions behind UPDATE_OWN_PERMISSIONS.
  async update(id: string, data: UpdateMemberRequest, actingUser: AuthUser): Promise<MemberDetail> {
    const current = await this.getById(id) // 404s if missing/deleted

    const editsAccessControl =
      data.role_id !== undefined ||
      data.departments !== undefined ||
      data.extra_permissions !== undefined ||
      data.revoked_permissions !== undefined

    if (
      id === actingUser.id &&
      editsAccessControl &&
      !actingUser.permissions.includes(PERMISSIONS.MEMBER.UPDATE_OWN_PERMISSIONS)
    ) {
      throw new AppError(memberMessages.CANNOT_EDIT_OWN_PERMISSIONS, HTTP_STATUS.FORBIDDEN)
    }

    if (data.email !== undefined) await this.assertEmailAvailable(data.email, id)
    if (data.role_id !== undefined) await this.assertRoleExists(data.role_id)

    // Firm access is validated against the departments the member WILL have.
    const nextDepartments =
      data.departments !== undefined ? uniqueStrings(data.departments) : current.departments
    const nextFirmIds =
      data.firm_ids !== undefined ? uniqueStrings(data.firm_ids) : current.firms.map((f) => f.id)
    const reconcileFirms = data.firm_ids !== undefined || data.departments !== undefined
    if (reconcileFirms) {
      await this.assertFirmsValid(nextFirmIds, nextDepartments)
    }

    const updates: string[] = []
    const values: any[] = []
    let i = 1
    const set = (col: string, val: any) => {
      updates.push(`${col} = $${i++}`)
      values.push(val)
    }

    if (data.email !== undefined) set('email', data.email)
    if (data.first_name !== undefined) set('first_name', data.first_name)
    if (data.last_name !== undefined) set('last_name', data.last_name)
    if (data.phone !== undefined) set('phone', data.phone ?? null)
    if (data.role_id !== undefined) set('role_id', data.role_id)
    if (data.departments !== undefined) set('departments', nextDepartments)
    if (data.extra_permissions !== undefined) {
      set('extra_permissions', normalizeCodes(data.extra_permissions))
    }
    if (data.revoked_permissions !== undefined) {
      set('revoked_permissions', normalizeCodes(data.revoked_permissions))
    }
    if (data.password !== undefined) set('password', await hashPassword(data.password))

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      if (updates.length > 0) {
        values.push(id)
        await client.query(`UPDATE members SET ${updates.join(', ')} WHERE id = $${i}`, values)
      }
      if (reconcileFirms) {
        await this.replaceFirms(client, id, nextFirmIds)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return this.getById(id)
  },

  // Activate / deactivate a member. Members are never hard-deleted; deactivating
  // blocks login. A member cannot deactivate their own account.
  async setStatus(id: string, isActive: boolean, actingUser: AuthUser): Promise<MemberDetail> {
    await this.getById(id) // 404s if missing/deleted

    if (id === actingUser.id && !isActive) {
      throw new AppError(memberMessages.CANNOT_DEACTIVATE_SELF, HTTP_STATUS.BAD_REQUEST)
    }

    await db.query(`UPDATE members SET is_active = $2 WHERE id = $1`, [id, isActive])
    return this.getById(id)
  },
}
