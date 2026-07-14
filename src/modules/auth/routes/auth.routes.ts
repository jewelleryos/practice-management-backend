import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { authService } from '../services/auth.service'
import { loginSchema } from '../config/auth.schema'
import { authMessages } from '../config/auth.messages'
import { authConfig } from '../../../config/auth.config'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import type { LoginResponse } from '../types/auth.types'
import type { AppEnv } from '../../../types/hono.types'

export const authRoutes = new Hono<AppEnv>()

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const data = loginSchema.parse(body)
    const { response, token } = await authService.login(data)

    // Token lives in an HTTP-only cookie — never in the response body.
    setCookie(c, authConfig.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: authConfig.jwt.auth.cookieMaxAge,
      path: '/',
    })

    return successResponse<LoginResponse>(c, authMessages.LOGIN_SUCCESS, response)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/auth/me — current session's member + effective permissions
authRoutes.get('/me', authWithPermission(), async (c) => {
  try {
    const user = c.get('user')

    return successResponse<LoginResponse>(c, authMessages.USER_FETCHED, {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      departments: user.departments,
      permissions: user.permissions,
    })
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/auth/logout
authRoutes.post('/logout', authWithPermission(), async (c) => {
  try {
    const user = c.get('user')

    // Delete the session row (revokes the token) then clear the cookie.
    await authService.logout(user.session_id)
    deleteCookie(c, authConfig.cookieName, { path: '/' })

    return successResponse(c, authMessages.LOGOUT_SUCCESS, null)
  } catch (error) {
    return errorHandler(error, c)
  }
})
