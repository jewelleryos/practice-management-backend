import { Hono } from 'hono'
import { workStatusService } from '../services/work-statuses.service'
import { workStatusMessages } from '../config/work-statuses.messages'
import { createWorkStatusSchema, updateWorkStatusSchema } from '../config/work-statuses.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { WorkStatus, WorkStatusListResponse } from '../types/work-statuses.types'

// Work statuses are practice-wide master data used to track task progress. There
// is NO delete route yet — work statuses cannot be deleted (deferred; see root
// CLAUDE.md); retire one with the is_active flag instead.
export const workStatusRoutes = new Hono<AppEnv>()

// GET /api/work-statuses — list all
workStatusRoutes.get('/', authWithPermission(PERMISSIONS.WORK_STATUS.READ), async (c) => {
  try {
    const result = await workStatusService.list()
    return successResponse<WorkStatusListResponse>(c, workStatusMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/work-statuses/for-tax-task — active work statuses (with is_default)
// for the task create form. Permission-detached from WORK_STATUS.READ; gated on
// TAX_TASK.CREATE so a create-only member can populate the picker. Before /:id.
workStatusRoutes.get(
  '/for-tax-task',
  authWithPermission(PERMISSIONS.TAX_TASK.CREATE),
  async (c) => {
    try {
      const result = await workStatusService.activeForTaxTask()
      return successResponse(c, workStatusMessages.LIST_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/work-statuses/for-work-status-board — active work statuses for the Work
// Status board's change-work-status modal. Gated on WORK_STATUS_BOARD.CHANGE_WORK_STATUS
// so a board member (who may lack TAX_TASK.CREATE) can populate the picker. Before /:id.
workStatusRoutes.get(
  '/for-work-status-board',
  authWithPermission(PERMISSIONS.WORK_STATUS_BOARD.CHANGE_WORK_STATUS),
  async (c) => {
    try {
      const result = await workStatusService.activeForTaxTask()
      return successResponse(c, workStatusMessages.LIST_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/work-statuses/:id — one work status
workStatusRoutes.get('/:id', authWithPermission(PERMISSIONS.WORK_STATUS.READ), async (c) => {
  try {
    const result = await workStatusService.getById(c.req.param('id')!)
    return successResponse<WorkStatus>(c, workStatusMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/work-statuses — create
workStatusRoutes.post('/', authWithPermission(PERMISSIONS.WORK_STATUS.CREATE), async (c) => {
  try {
    const data = createWorkStatusSchema.parse(await c.req.json())
    const result = await workStatusService.create(data)
    return successResponse<WorkStatus>(c, workStatusMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/work-statuses/:id — update
workStatusRoutes.put('/:id', authWithPermission(PERMISSIONS.WORK_STATUS.UPDATE), async (c) => {
  try {
    const data = updateWorkStatusSchema.parse(await c.req.json())
    const result = await workStatusService.update(c.req.param('id')!, data)
    return successResponse<WorkStatus>(c, workStatusMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
