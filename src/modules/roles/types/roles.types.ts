import type { PermissionModule } from '../../../config/permissions.constants'
import type { DepartmentCode } from '../../../config/departments.constants'

// A role is a named bundle of permission codes. Every member is assigned exactly
// one global role; per-member extra/revoked overrides live on the members table.
export interface Role {
  id: string
  name: string
  description: string | null
  permissions: number[]
  created_at: string
  updated_at: string
}

// List row — the role plus how many (non-deleted) members currently hold it.
export interface RoleListItem extends Role {
  member_count: number
}

export interface CreateRoleRequest {
  name: string
  description?: string | null
  permissions: number[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string | null
  permissions?: number[]
}

export interface RoleListResponse {
  items: RoleListItem[]
}

// The permission registry the UI needs to render the picker: every module grouped
// by department, plus the department list for labelling.
export interface PermissionRegistryResponse {
  departments: { code: DepartmentCode; label: string }[]
  modules: PermissionModule[]
}
