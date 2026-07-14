import type { AuthUser } from '../middleware/auth.middleware'

export type AppVariables = {
  user: AuthUser
}

export type AppEnv = {
  Variables: AppVariables
}
