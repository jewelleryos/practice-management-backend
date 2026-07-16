import { Hono } from 'hono'
import { softwareService } from '../services/software.service'
import { softwareMessages } from '../config/software.messages'
import { createSoftwareSchema, updateSoftwareSchema } from '../config/software.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { Software, SoftwareListResponse } from '../types/software.types'

// Software is practice-wide master data. There is NO delete route yet —
// software cannot be deleted (deferred; see root CLAUDE.md).
export const softwareRoutes = new Hono<AppEnv>()

// GET /api/software — list all
softwareRoutes.get('/', authWithPermission(PERMISSIONS.SOFTWARE.READ), async (c) => {
  try {
    const result = await softwareService.list()
    return successResponse<SoftwareListResponse>(c, softwareMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Software options for the tax-client add / edit screens. Permission detached
// from SOFTWARE.READ; gated on the tax-client action. Before /:id.
const softwareForTaxClient = async (c: any) => {
  try {
    const result = await softwareService.forTaxClient()
    return successResponse(c, softwareMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
softwareRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), softwareForTaxClient)
softwareRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), softwareForTaxClient)
softwareRoutes.get('/for-tax-client-list', authWithPermission(PERMISSIONS.TAX_CLIENT.READ), softwareForTaxClient)

// GET /api/software/:id — one software
softwareRoutes.get('/:id', authWithPermission(PERMISSIONS.SOFTWARE.READ), async (c) => {
  try {
    const result = await softwareService.getById(c.req.param('id')!)
    return successResponse<Software>(c, softwareMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/software — create
softwareRoutes.post('/', authWithPermission(PERMISSIONS.SOFTWARE.CREATE), async (c) => {
  try {
    const data = createSoftwareSchema.parse(await c.req.json())
    const result = await softwareService.create(data)
    return successResponse<Software>(c, softwareMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/software/:id — update
softwareRoutes.put('/:id', authWithPermission(PERMISSIONS.SOFTWARE.UPDATE), async (c) => {
  try {
    const data = updateSoftwareSchema.parse(await c.req.json())
    const result = await softwareService.update(c.req.param('id')!, data)
    return successResponse<Software>(c, softwareMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
