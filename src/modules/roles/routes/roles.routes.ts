import { Hono } from 'hono'
import { roleService } from '../services/roles.service'
import { roleMessages } from '../config/roles.messages'
import { createRoleSchema, updateRoleSchema } from '../config/roles.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS, PERMISSION_MODULES } from '../../../config/permissions.constants'
import { DEPARTMENT_LIST } from '../../../config/departments.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { Role, RoleListResponse, PermissionRegistryResponse } from '../types/roles.types'

export const roleRoutes = new Hono<AppEnv>()

// GET /api/roles/permissions — the permission registry for the role editor.
// Defined BEFORE /:id so 'permissions' isn't matched as an id.
roleRoutes.get('/permissions', authWithPermission(PERMISSIONS.ROLE.READ), async (c) => {
  try {
    const data: PermissionRegistryResponse = {
      departments: DEPARTMENT_LIST.map((d) => ({ code: d.code, label: d.label })),
      modules: PERMISSION_MODULES,
    }
    return successResponse<PermissionRegistryResponse>(c, roleMessages.PERMISSIONS_FETCHED, data)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/roles — list all roles with member counts
roleRoutes.get('/', authWithPermission(PERMISSIONS.ROLE.READ), async (c) => {
  try {
    const result = await roleService.list()
    return successResponse<RoleListResponse>(c, roleMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/roles/:id — one role
roleRoutes.get('/:id', authWithPermission(PERMISSIONS.ROLE.READ), async (c) => {
  try {
    const result = await roleService.getById(c.req.param('id')!)
    return successResponse<Role>(c, roleMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/roles — create
roleRoutes.post('/', authWithPermission(PERMISSIONS.ROLE.CREATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = createRoleSchema.parse(body)
    const result = await roleService.create(data)
    return successResponse<Role>(c, roleMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/roles/:id — update
roleRoutes.put('/:id', authWithPermission(PERMISSIONS.ROLE.UPDATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = updateRoleSchema.parse(body)
    const result = await roleService.update(c.req.param('id')!, data)
    return successResponse<Role>(c, roleMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// DELETE /api/roles/:id — soft-delete (blocked while assigned to members)
roleRoutes.delete('/:id', authWithPermission(PERMISSIONS.ROLE.DELETE), async (c) => {
  try {
    const user = c.get('user')
    await roleService.delete(c.req.param('id')!, user.id)
    return successResponse(c, roleMessages.DELETED, null)
  } catch (error) {
    return errorHandler(error, c)
  }
})
