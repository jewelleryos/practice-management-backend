import type { DepartmentCode } from '../../../config/departments.constants'

// A firm a member has access to (lean reference for the detail view / edit form).
export interface MemberFirmRef {
  id: string
  name: string
  department: DepartmentCode
}

// List row — the lean shape the members table needs.
export interface MemberListItem {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  role_id: string | null
  role_name: string | null
  departments: DepartmentCode[]
  firm_count: number
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// Full detail — everything the edit form + permission override editor needs.
// Never includes the password hash.
export interface MemberDetail {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  photo_url: string | null
  role_id: string | null
  role_name: string | null
  departments: DepartmentCode[]
  firms: MemberFirmRef[]
  extra_permissions: number[]
  revoked_permissions: number[]
  effective_permissions: number[] // (role ∪ extra − revoked), gated by departments
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateMemberRequest {
  email: string
  first_name: string
  last_name: string
  phone?: string | null
  password: string // admin sets the initial password
  role_id: string
  departments: DepartmentCode[]
  firm_ids: string[]
  extra_permissions: number[]
  revoked_permissions: number[]
}

// Every field optional — a partial update. Password, if present, is re-hashed.
export interface UpdateMemberRequest {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
  password?: string
  role_id?: string
  departments?: DepartmentCode[]
  firm_ids?: string[]
  extra_permissions?: number[]
  revoked_permissions?: number[]
}

export interface UpdateMemberStatusRequest {
  is_active: boolean
}

export interface MemberListResponse {
  items: MemberListItem[]
}
