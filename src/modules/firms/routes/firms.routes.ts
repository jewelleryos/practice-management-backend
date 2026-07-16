import { Hono } from 'hono'
import { firmService } from '../services/firms.service'
import { firmMessages } from '../config/firms.messages'
import { createFirmSchema, updateFirmSchema } from '../config/firms.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import { isDepartmentCode } from '../../../config/departments.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { Firm, FirmListResponse } from '../types/firms.types'

export const firmRoutes = new Hono<AppEnv>()

// GET /api/firms — list firms (optionally ?department=tax_practice|mortgage)
firmRoutes.get('/', authWithPermission(PERMISSIONS.FIRM.READ), async (c) => {
  try {
    const dept = c.req.query('department')
    const filter = dept && isDepartmentCode(dept) ? dept : undefined
    const result = await firmService.list(filter)
    return successResponse<FirmListResponse>(c, firmMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Firm dropdown options for the tax-client add / edit / list-filter screens.
// Same data (the member's accessible tax firms), but the permission is detached
// from FIRM.READ and gated on the tax-client action instead. Declared before
// /:id so they aren't swallowed by the param route.
const firmsForTaxClient = async (c: any) => {
  try {
    const result = await firmService.forTaxClient(c.get('user').id)
    return successResponse(c, firmMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
firmRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), firmsForTaxClient)
firmRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), firmsForTaxClient)
firmRoutes.get('/for-tax-client-list', authWithPermission(PERMISSIONS.TAX_CLIENT.READ), firmsForTaxClient)

// ── Mortgage-task "for" route ──
// Firm dropdown options for the mortgage-task create form — the member's accessible
// mortgage firms. Gated on MORTGAGE_TASK.CREATE, not FIRM.READ.
firmRoutes.get('/for-mortgage-task', authWithPermission(PERMISSIONS.MORTGAGE_TASK.CREATE), async (c) => {
  try {
    const result = await firmService.forMortgageTask(c.get('user').id)
    return successResponse(c, firmMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/firms/:id — one firm
firmRoutes.get('/:id', authWithPermission(PERMISSIONS.FIRM.READ), async (c) => {
  try {
    const result = await firmService.getById(c.req.param('id')!)
    return successResponse<Firm>(c, firmMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/firms — create
firmRoutes.post('/', authWithPermission(PERMISSIONS.FIRM.CREATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = createFirmSchema.parse(body)
    const result = await firmService.create(data)
    return successResponse<Firm>(c, firmMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/firms/:id — update
firmRoutes.put('/:id', authWithPermission(PERMISSIONS.FIRM.UPDATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = updateFirmSchema.parse(body)
    const result = await firmService.update(c.req.param('id')!, data)
    return successResponse<Firm>(c, firmMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// DELETE /api/firms/:id — soft-delete (blocked while assigned to members)
firmRoutes.delete('/:id', authWithPermission(PERMISSIONS.FIRM.DELETE), async (c) => {
  try {
    const user = c.get('user')
    await firmService.delete(c.req.param('id')!, user.id)
    return successResponse(c, firmMessages.DELETED, null)
  } catch (error) {
    return errorHandler(error, c)
  }
})
