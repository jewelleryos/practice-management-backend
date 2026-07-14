import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyToken } from '../utils/jwt'
import { computeEffectivePermissions } from '../utils/permissions'
import { db } from '../lib/db'
import { authConfig } from '../config/auth.config'
import type { DepartmentCode } from '../config/departments.constants'

// JWT payload shape (mirrors what the auth module signs on login).
interface JwtPayload {
  session_id: string
  user_id: string
  email: string
  first_name: string
  last_name: string
}

export interface AuthUser {
  id: string
  email: string
  first_name: string
  last_name: string
  departments: DepartmentCode[]
  permissions: number[] // effective (role ∪ extra − revoked, gated by department)
  session_id: string
}

// Guards a route. Pass a permission code to require it; omit to just require a
// valid, logged-in member (e.g. /me, /logout).
export const authWithPermission = (requiredPermission?: number) => {
  return async (c: Context, next: Next) => {
    // 1. Token from cookie
    const token = getCookie(c, authConfig.cookieName)

    if (!token) {
      return c.json({ success: false, message: 'Unauthorized' }, 401)
    }

    try {
      // 2. Verify JWT (signature + expiry)
      const decoded = verifyToken<JwtPayload>(token, authConfig.jwt.auth.secret)

      // 3. Session must still exist (delete row = logout)
      const sessionResult = await db.query(
        `SELECT id, token FROM member_sessions WHERE id = $1`,
        [decoded.session_id]
      )

      if (sessionResult.rows.length === 0) {
        return c.json({ success: false, message: 'Session expired' }, 401)
      }

      // 4. Token must match the stored one (blocks reuse after logout)
      if (sessionResult.rows[0].token !== token) {
        return c.json({ success: false, message: 'Invalid session' }, 401)
      }

      // 5. Load the member with their role's permission bundle
      const memberResult = await db.query(
        `SELECT m.id, m.email, m.first_name, m.last_name, m.is_active, m.is_deleted,
                m.departments, m.extra_permissions, m.revoked_permissions,
                COALESCE(r.permissions, '{}') AS role_permissions
         FROM members m
         LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = FALSE
         WHERE m.id = $1`,
        [decoded.user_id]
      )

      const member = memberResult.rows[0]

      if (!member || member.is_deleted || !member.is_active) {
        return c.json({ success: false, message: 'User not found or inactive' }, 401)
      }

      // 6. Compute effective permissions (gated by department access)
      const permissions = computeEffectivePermissions(
        member.role_permissions || [],
        member.extra_permissions || [],
        member.revoked_permissions || [],
        member.departments || []
      )

      // 7. Enforce the required permission, if any
      if (requiredPermission && !permissions.includes(requiredPermission)) {
        return c.json({ success: false, message: 'Forbidden' }, 403)
      }

      // 8. Attach the member to the context
      c.set('user', {
        id: member.id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        departments: member.departments || [],
        permissions,
        session_id: decoded.session_id,
      } as AuthUser)

      await next()
    } catch (error) {
      return c.json({ success: false, message: 'Invalid token' }, 401)
    }
  }
}
