import { Hono } from 'hono'
import { clientGroupService } from '../services/client-groups.service'
import { clientGroupMessages } from '../config/client-groups.messages'
import { createClientGroupSchema, updateClientGroupSchema } from '../config/client-groups.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { ClientGroup, ClientGroupListResponse } from '../types/client-groups.types'

// Client groups are practice-wide master data. There is NO delete route yet —
// client groups cannot be deleted (deferred; see root CLAUDE.md).
export const clientGroupRoutes = new Hono<AppEnv>()

// GET /api/client-groups — list all
clientGroupRoutes.get('/', authWithPermission(PERMISSIONS.CLIENT_GROUP.READ), async (c) => {
  try {
    const result = await clientGroupService.list()
    return successResponse<ClientGroupListResponse>(c, clientGroupMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Client-group options for the tax-client add / edit / list-filter screens.
// Permission detached from CLIENT_GROUP.READ; gated on the tax-client action.
// Declared before /:id so they aren't swallowed by the param route.
const clientGroupsForTaxClient = async (c: any) => {
  try {
    const result = await clientGroupService.forTaxClient()
    return successResponse(c, clientGroupMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
clientGroupRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), clientGroupsForTaxClient)
clientGroupRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), clientGroupsForTaxClient)
clientGroupRoutes.get('/for-tax-client-list', authWithPermission(PERMISSIONS.TAX_CLIENT.READ), clientGroupsForTaxClient)

// GET /api/client-groups/:id — one client group
clientGroupRoutes.get('/:id', authWithPermission(PERMISSIONS.CLIENT_GROUP.READ), async (c) => {
  try {
    const result = await clientGroupService.getById(c.req.param('id')!)
    return successResponse<ClientGroup>(c, clientGroupMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/client-groups — create
clientGroupRoutes.post('/', authWithPermission(PERMISSIONS.CLIENT_GROUP.CREATE), async (c) => {
  try {
    const data = createClientGroupSchema.parse(await c.req.json())
    const result = await clientGroupService.create(data)
    return successResponse<ClientGroup>(c, clientGroupMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/client-groups/:id — update
clientGroupRoutes.put('/:id', authWithPermission(PERMISSIONS.CLIENT_GROUP.UPDATE), async (c) => {
  try {
    const data = updateClientGroupSchema.parse(await c.req.json())
    const result = await clientGroupService.update(c.req.param('id')!, data)
    return successResponse<ClientGroup>(c, clientGroupMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
