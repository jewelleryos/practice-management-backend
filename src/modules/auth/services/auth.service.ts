import { db } from '../../../lib/db'
import { generateToken } from '../../../utils/jwt'
import { computeEffectivePermissions } from '../../../utils/permissions'
import { authConfig } from '../../../config/auth.config'
import { authMessages } from '../config/auth.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import type { LoginRequest, LoginServiceResult, JwtPayload } from '../types/auth.types'

export const authService = {
  async login(data: LoginRequest): Promise<LoginServiceResult> {
    // Find the member by email, joining the role's permission bundle.
    const result = await db.query(
      `SELECT m.id, m.email, m.first_name, m.last_name, m.password,
              m.is_active, m.is_deleted, m.account_locked_until,
              m.departments, m.extra_permissions, m.revoked_permissions,
              COALESCE(r.permissions, '{}') AS role_permissions
       FROM members m
       LEFT JOIN roles r ON r.id = m.role_id AND r.is_deleted = FALSE
       WHERE m.email = $1`,
      [data.email]
    )

    const member = result.rows[0]

    // Member must exist and not be soft-deleted.
    if (!member || member.is_deleted) {
      throw new AppError(authMessages.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED)
    }

    // Account must be active.
    if (!member.is_active) {
      throw new AppError(authMessages.ACCOUNT_INACTIVE, HTTP_STATUS.FORBIDDEN)
    }

    // Account must not be locked.
    if (member.account_locked_until && new Date(member.account_locked_until) > new Date()) {
      throw new AppError(authMessages.ACCOUNT_LOCKED, HTTP_STATUS.FORBIDDEN)
    }

    // Verify password (bcrypt via Bun's native API).
    const isValidPassword = await Bun.password.verify(data.password, member.password)
    if (!isValidPassword) {
      throw new AppError(authMessages.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED)
    }

    // Stamp last login.
    await db.query(`UPDATE members SET last_login_at = NOW() WHERE id = $1`, [member.id])

    // Create the session row (token filled in after signing).
    const sessionResult = await db.query(
      `INSERT INTO member_sessions (member_id, token) VALUES ($1, $2) RETURNING id`,
      [member.id, '']
    )
    const sessionId = sessionResult.rows[0].id

    // Sign the JWT carrying the session id.
    const payload: JwtPayload = {
      session_id: sessionId,
      user_id: member.id,
      email: member.email,
      first_name: member.first_name,
      last_name: member.last_name,
    }
    const token = generateToken(payload, authConfig.jwt.auth.secret, authConfig.jwt.auth.expiresIn)

    // Store the signed token on the session (used to detect reuse after logout).
    await db.query(`UPDATE member_sessions SET token = $1 WHERE id = $2`, [token, sessionId])

    // Effective permissions = (role ∪ extra) − revoked, gated by department access.
    const permissions = computeEffectivePermissions(
      member.role_permissions || [],
      member.extra_permissions || [],
      member.revoked_permissions || [],
      member.departments || []
    )

    return {
      response: {
        user: {
          id: member.id,
          email: member.email,
          first_name: member.first_name,
          last_name: member.last_name,
        },
        departments: member.departments || [],
        permissions,
      },
      token,
    }
  },

  async logout(sessionId: string): Promise<void> {
    await db.query(`DELETE FROM member_sessions WHERE id = $1`, [sessionId])
  },
}
