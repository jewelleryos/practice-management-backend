import { Hono } from 'hono'
import { serviceService } from '../services/services.service'
import { serviceMessages } from '../config/services.messages'
import { createServiceSchema, updateServiceSchema } from '../config/services.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import { isDepartmentCode } from '../../../config/departments.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { Service, ServiceListResponse } from '../types/services.types'

// Services are master data, each scoped to one department. There is NO delete
// route yet — services cannot be deleted (deferred; see root CLAUDE.md).
export const serviceRoutes = new Hono<AppEnv>()

// GET /api/services — list services (optionally ?department=tax_practice|mortgage)
serviceRoutes.get('/', authWithPermission(PERMISSIONS.SERVICE.READ), async (c) => {
  try {
    const dept = c.req.query('department')
    const filter = dept && isDepartmentCode(dept) ? dept : undefined
    const result = await serviceService.list(filter)
    return successResponse<ServiceListResponse>(c, serviceMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Tax Practice service options (with frequencies) for the tax-client add / edit
// screens. Permission detached from SERVICE.READ; gated on the tax-client
// action. Before /:id.
const servicesForTaxClient = async (c: any) => {
  try {
    const result = await serviceService.forTaxClient()
    return successResponse(c, serviceMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
serviceRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), servicesForTaxClient)
serviceRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), servicesForTaxClient)

// Service options for the Service Checklists admin screen (filter + add dropdown).
// Permission detached from SERVICE.READ; gated on SERVICE_CHECKLIST.READ so a
// checklist-only admin can still list services. Before /:id.
serviceRoutes.get('/for-service-checklist', authWithPermission(PERMISSIONS.SERVICE_CHECKLIST.READ), async (c) => {
  try {
    const result = await serviceService.forServiceChecklist()
    return successResponse(c, serviceMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/services/:id — one service
serviceRoutes.get('/:id', authWithPermission(PERMISSIONS.SERVICE.READ), async (c) => {
  try {
    const result = await serviceService.getById(c.req.param('id')!)
    return successResponse<Service>(c, serviceMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/services — create
serviceRoutes.post('/', authWithPermission(PERMISSIONS.SERVICE.CREATE), async (c) => {
  try {
    const data = createServiceSchema.parse(await c.req.json())
    const result = await serviceService.create(data)
    return successResponse<Service>(c, serviceMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/services/:id — update
serviceRoutes.put('/:id', authWithPermission(PERMISSIONS.SERVICE.UPDATE), async (c) => {
  try {
    const data = updateServiceSchema.parse(await c.req.json())
    const result = await serviceService.update(c.req.param('id')!, data)
    return successResponse<Service>(c, serviceMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
