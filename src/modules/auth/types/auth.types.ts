import type { DepartmentCode } from '../../../config/departments.constants'

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthUserPayload {
  id: string
  email: string
  first_name: string
  last_name: string
}

export interface LoginResponse {
  user: AuthUserPayload
  departments: DepartmentCode[] // departments the member can switch into
  permissions: number[] // effective permission codes (gated by department)
}

export interface LoginServiceResult {
  response: LoginResponse
  token: string
}

export interface JwtPayload {
  session_id: string
  user_id: string
  email: string
  first_name: string
  last_name: string
}
