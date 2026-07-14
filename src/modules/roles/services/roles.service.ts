import { db } from '../../../lib/db'
import { roleMessages } from '../config/roles.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type {
  Role,
  RoleListResponse,
  CreateRoleRequest,
  UpdateRoleRequest,
} from '../types/roles.types'

// Normalise a permission bundle: drop duplicates, sort ascending for stable storage.
function normalizePermissions(codes: number[]): number[] {
  return [...new Set(codes)].sort((a, b) => a - b)
}

export const roleService = {
  // List all non-deleted roles, each with its current member count.
  async list(): Promise<RoleListResponse> {
    const result = await db.query(
      `SELECT r.id, r.name, r.description, r.permissions,
              r.created_at, r.updated_at,
              COUNT(m.id) FILTER (WHERE m.is_deleted = FALSE)::int AS member_count
       FROM roles r
       LEFT JOIN members m ON m.role_id = r.id
       WHERE r.is_deleted = FALSE
       GROUP BY r.id
       ORDER BY r.name ASC`
    )

    return { items: result.rows }
  },

  // Fetch a single non-deleted role by id.
  async getById(id: string): Promise<Role> {
    const result = await db.query(
      `SELECT id, name, description, permissions, created_at, updated_at
       FROM roles
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    )

    if (result.rows.length === 0) {
      throw new AppError(roleMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }

    return result.rows[0]
  },

  // How many non-deleted members currently hold this role.
  async memberCount(id: string): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM members
       WHERE role_id = $1 AND is_deleted = FALSE`,
      [id]
    )
    return result.rows[0].count
  },

  async create(data: CreateRoleRequest): Promise<Role> {
    // Name must be unique among non-deleted roles.
    const existing = await db.query(
      `SELECT id FROM roles WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE`,
      [data.name]
    )
    if (existing.rows.length > 0) {
      throw new AppError(roleMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
    }

    const result = await db.query(
      `INSERT INTO roles (name, description, permissions)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [data.name, data.description ?? null, normalizePermissions(data.permissions)]
    )

    return this.getById(result.rows[0].id)
  },

  async update(id: string, data: UpdateRoleRequest): Promise<Role> {
    await this.getById(id) // 404s if missing/deleted

    // If renaming, the new name must not collide with another non-deleted role.
    if (data.name !== undefined) {
      const clash = await db.query(
        `SELECT id FROM roles
         WHERE LOWER(name) = LOWER($1) AND id != $2 AND is_deleted = FALSE`,
        [data.name, id]
      )
      if (clash.rows.length > 0) {
        throw new AppError(roleMessages.NAME_EXISTS, HTTP_STATUS.CONFLICT)
      }
    }

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
    if (data.permissions !== undefined) {
      updates.push(`permissions = $${i++}`)
      values.push(normalizePermissions(data.permissions))
    }

    if (updates.length === 0) {
      return this.getById(id)
    }

    values.push(id)
    await db.query(`UPDATE roles SET ${updates.join(', ')} WHERE id = $${i}`, values)

    return this.getById(id)
  },

  // Soft-delete. Blocked while any member still holds the role — they must be
  // reassigned first.
  async delete(id: string, deletedBy: string): Promise<void> {
    await this.getById(id) // 404s if missing/deleted

    const count = await this.memberCount(id)
    if (count > 0) {
      throw new AppError(
        `This role is assigned to ${count} member${count === 1 ? '' : 's'}. Change their role first, then delete this role.`,
        HTTP_STATUS.CONFLICT
      )
    }

    await db.query(
      `UPDATE roles
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
       WHERE id = $1`,
      [id, deletedBy]
    )
  },
}
