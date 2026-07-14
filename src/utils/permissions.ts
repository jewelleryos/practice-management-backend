import { PERMISSION_DEPARTMENT } from '../config/permissions.constants'
import type { DepartmentCode } from '../config/departments.constants'

// Compute a member's EFFECTIVE permission codes.
//
//   effective = (role.permissions ∪ extra_permissions) − revoked_permissions,
//   then GATED by department access: a permission is kept only if it is global
//   (department === null) or belongs to a department the member has access to.
//
// Unknown codes (not in the permission registry) are dropped.
export function computeEffectivePermissions(
  rolePermissions: number[],
  extraPermissions: number[],
  revokedPermissions: number[],
  departments: DepartmentCode[]
): number[] {
  const revoked = new Set(revokedPermissions)
  const departmentSet = new Set<string>(departments)

  const granted = new Set<number>()
  for (const code of rolePermissions) granted.add(code)
  for (const code of extraPermissions) granted.add(code)

  const effective: number[] = []
  for (const code of granted) {
    if (revoked.has(code)) continue
    if (!(code in PERMISSION_DEPARTMENT)) continue // unknown code — ignore

    const department = PERMISSION_DEPARTMENT[code]
    if (department === null || departmentSet.has(department)) {
      effective.push(code)
    }
  }

  return effective.sort((a, b) => a - b)
}
