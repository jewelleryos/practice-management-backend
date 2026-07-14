// Shared auth configuration — JWT secrets, token lifetimes and cookie settings.
// Both the auth middleware and the auth module read from here.

export const authConfig = {
  cookieName: 'auth_token',
  jwt: {
    auth: {
      secret: process.env.AUTH_JWT_SECRET!,
      expiresIn: '1d',
      cookieMaxAge: 24 * 60 * 60, // 1 day in seconds
    },
    passwordReset: {
      secret: process.env.PASSWORD_RESET_JWT_SECRET!,
      expiresIn: '1h',
      dbExpiryMs: 1.5 * 60 * 60 * 1000, // 1.5h buffer for the DB copy
    },
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
}
