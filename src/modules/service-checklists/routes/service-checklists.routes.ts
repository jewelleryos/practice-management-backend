import { Hono } from 'hono'
import { serviceChecklistService } from '../services/service-checklists.service'
import { serviceChecklistMessages } from '../config/service-checklists.messages'
import {
  createServiceChecklistItemSchema,
  updateServiceChecklistItemSchema,
} from '../config/service-checklists.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type {
  ServiceChecklistItem,
  ServiceChecklistListResponse,
} from '../types/service-checklists.types'

// Services Checklist — master data. Default checklist items per service, later
// copied onto tasks. There is NO delete route yet (deferred; see root CLAUDE.md).
export const serviceChecklistRoutes = new Hono<AppEnv>()

// GET /api/service-checklists — every non-deleted service with its checklist items
serviceChecklistRoutes.get('/', authWithPermission(PERMISSIONS.SERVICE_CHECKLIST.READ), async (c) => {
  try {
    const result = await serviceChecklistService.list()
    return successResponse<ServiceChecklistListResponse>(c, serviceChecklistMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/service-checklists/for-tax-task?service_id=X — a service's active
// checklist items, for the task create form's read-only preview. Permission-
// detached from SERVICE_CHECKLIST.READ; gated on TAX_TASK.CREATE. Before /:id.
serviceChecklistRoutes.get(
  '/for-tax-task',
  authWithPermission(PERMISSIONS.TAX_TASK.CREATE),
  async (c) => {
    try {
      const serviceId = c.req.query('service_id')
      if (!serviceId) {
        return successResponse(c, serviceChecklistMessages.LIST_FETCHED, { items: [] })
      }
      const result = await serviceChecklistService.activeForService(serviceId)
      return successResponse(c, serviceChecklistMessages.LIST_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/service-checklists/:id — one checklist item
serviceChecklistRoutes.get('/:id', authWithPermission(PERMISSIONS.SERVICE_CHECKLIST.READ), async (c) => {
  try {
    const result = await serviceChecklistService.getById(c.req.param('id')!)
    return successResponse<ServiceChecklistItem>(c, serviceChecklistMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/service-checklists — create a checklist item for a service
serviceChecklistRoutes.post('/', authWithPermission(PERMISSIONS.SERVICE_CHECKLIST.CREATE), async (c) => {
  try {
    const data = createServiceChecklistItemSchema.parse(await c.req.json())
    const result = await serviceChecklistService.create(data)
    return successResponse<ServiceChecklistItem>(c, serviceChecklistMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/service-checklists/:id — update (also toggles is_active)
serviceChecklistRoutes.put('/:id', authWithPermission(PERMISSIONS.SERVICE_CHECKLIST.UPDATE), async (c) => {
  try {
    const data = updateServiceChecklistItemSchema.parse(await c.req.json())
    const result = await serviceChecklistService.update(c.req.param('id')!, data)
    return successResponse<ServiceChecklistItem>(c, serviceChecklistMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
