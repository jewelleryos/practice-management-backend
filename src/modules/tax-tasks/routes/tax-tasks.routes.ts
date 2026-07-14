import { Hono } from 'hono'
import { taxTaskService } from '../services/tax-tasks.service'
import { taxTaskCommentService } from '../services/tax-task-comments.service'
import { taxTaskActivityService } from '../services/tax-task-activity.service'
import { taxTaskMessages } from '../config/tax-tasks.messages'
import {
  createTaxTaskSchema,
  createGeneralTaskSchema,
  listTaxTasksQuerySchema,
  updateTaxTaskStatusSchema,
  reassignTaxTaskSchema,
  toggleChecklistItemSchema,
  taskFieldParamSchema,
  updateTaskFieldSchema,
  createTaskCommentSchema,
  updateTaskCommentSchema,
  workStatusGridQuerySchema,
} from '../config/tax-tasks.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type {
  CreateTaxTaskResult,
  TaxTaskDetail,
  TaxTaskListResponse,
  TaxTaskFilterOptions,
  WorkStatusOptionsResponse,
  WorkStatusGridResponse,
  TaxTaskWriteResult,
  TaskCommentView,
  TaskCommentListResponse,
  TaskActivityListResponse,
} from '../types/tax-tasks.types'

// Tax Practice tasks (department-scoped; mortgage tasks live elsewhere). Visibility
// is data-scoped in the service: firm access + VIEW_ALL vs VIEW_ASSIGNED. There is
// NO delete route yet (deferred; see root CLAUDE.md).
export const taxTaskRoutes = new Hono<AppEnv>()

// GET /api/tax-tasks — scoped list (VIEW_ALL → all in firm; VIEW_ASSIGNED → own).
// Guarded only by a valid login; the view breadth (and 403 when the caller has
// neither view permission) is enforced in the service via resolveScope.
taxTaskRoutes.get('/', authWithPermission(), async (c) => {
  try {
    const query = listTaxTasksQuerySchema.parse(c.req.query())
    const result = await taxTaskService.list(c.get('user'), query)
    return successResponse<TaxTaskListResponse>(c, taxTaskMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-tasks/filter-options — distinct services / preparers / financial
// years within the caller's visible tasks, for the global Tasks page dropdowns.
// View-gated (login-only here; the service's resolveScope rejects create-only
// callers), NOT CREATE-gated — so a view-only member can load their filters.
// Declared before /:id so the static segment wins.
taxTaskRoutes.get('/filter-options', authWithPermission(), async (c) => {
  try {
    const result = await taxTaskService.filterOptions(c.get('user'))
    return successResponse<TaxTaskFilterOptions>(c, taxTaskMessages.FILTER_OPTIONS_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Work Status board (own permission, NOT the task view codes) ──

// GET /api/tax-tasks/work-status-options — services (+ frequencies) and financial
// years for the Work Status page pickers. Before /:id.
taxTaskRoutes.get(
  '/work-status-options',
  authWithPermission(PERMISSIONS.WORK_STATUS_BOARD.VIEW),
  async (c) => {
    try {
      const result = await taxTaskService.workStatusOptions()
      return successResponse<WorkStatusOptionsResponse>(c, taxTaskMessages.LIST_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/tax-tasks/work-status-grid — the service-wise status grid (clients ×
// periods) for one service + frequency (+ scope). Before /:id.
taxTaskRoutes.get(
  '/work-status-grid',
  authWithPermission(PERMISSIONS.WORK_STATUS_BOARD.VIEW),
  async (c) => {
    try {
      const query = workStatusGridQuerySchema.parse(c.req.query())
      const result = await taxTaskService.workStatusGrid(c.get('user'), query)
      return successResponse<WorkStatusGridResponse>(c, taxTaskMessages.LIST_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/tax-tasks/:id — one task (scoped like the list).
taxTaskRoutes.get('/:id', authWithPermission(), async (c) => {
  try {
    const result = await taxTaskService.getById(c.get('user'), c.req.param('id')!)
    return successResponse<TaxTaskDetail>(c, taxTaskMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-tasks — create a task (checklist snapshotted from the service).
taxTaskRoutes.post('/', authWithPermission(PERMISSIONS.TAX_TASK.CREATE), async (c) => {
  try {
    const data = createTaxTaskSchema.parse(await c.req.json())
    const result = await taxTaskService.create(c.get('user'), data)
    return successResponse<CreateTaxTaskResult>(c, taxTaskMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-tasks/general — create a GENERAL (ad-hoc) task: no service /
// frequency / period, a plain title + user-defined checklist. Same permission
// as a service task (TAX_TASK.CREATE). Registered before /:id (distinct method).
taxTaskRoutes.post('/general', authWithPermission(PERMISSIONS.TAX_TASK.CREATE), async (c) => {
  try {
    const data = createGeneralTaskSchema.parse(await c.req.json())
    const result = await taxTaskService.createGeneral(c.get('user'), data)
    return successResponse<CreateTaxTaskResult>(c, taxTaskMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-tasks/:id/status — change lifecycle status. Anyone who can see
// the task; → completed is reviewer-only and requires all required items done.
taxTaskRoutes.patch('/:id/status', authWithPermission(), async (c) => {
  try {
    const { status } = updateTaxTaskStatusSchema.parse(await c.req.json())
    const result = await taxTaskService.changeStatus(c.get('user'), c.req.param('id')!, status)
    return successResponse<TaxTaskWriteResult>(c, taxTaskMessages.STATUS_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-tasks/:id/assignment — reassign preparer / reviewer.
// VIEW_ALL members or the assigned preparer only.
taxTaskRoutes.patch('/:id/assignment', authWithPermission(), async (c) => {
  try {
    const data = reassignTaxTaskSchema.parse(await c.req.json())
    const result = await taxTaskService.reassign(c.get('user'), c.req.param('id')!, data)
    return successResponse<TaxTaskWriteResult>(c, taxTaskMessages.REASSIGNED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-tasks/:id/checklist/:itemId — tick / untick a checklist item.
// Anyone who can see the task.
taxTaskRoutes.patch('/:id/checklist/:itemId', authWithPermission(), async (c) => {
  try {
    const { is_done } = toggleChecklistItemSchema.parse(await c.req.json())
    const result = await taxTaskService.setChecklistItemDone(
      c.get('user'),
      c.req.param('id')!,
      c.req.param('itemId')!,
      is_done,
    )
    return successResponse<TaxTaskWriteResult>(c, taxTaskMessages.CHECKLIST_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-tasks/:id/:field — edit ONE plain field (priority, work-status,
// description, due-date, period-start, period-end). Auto-save entry point for the
// task modal; body is { value }. Editable by VIEW_ALL members or the assigned
// preparer. Static sub-routes above (/status, /assignment, /comments, /activity)
// take precedence, so :field only ever matches the allowlisted field names.
const FIELD_UPDATED_MESSAGE: Record<string, string> = {
  priority: taxTaskMessages.PRIORITY_UPDATED,
  'work-status': taxTaskMessages.WORK_STATUS_UPDATED,
  description: taxTaskMessages.DESCRIPTION_UPDATED,
  'due-date': taxTaskMessages.DUE_DATE_UPDATED,
  'period-start': taxTaskMessages.PERIOD_DATES_UPDATED,
  'period-end': taxTaskMessages.PERIOD_DATES_UPDATED,
}
taxTaskRoutes.patch('/:id/:field', authWithPermission(), async (c) => {
  try {
    const field = taskFieldParamSchema.parse(c.req.param('field'))
    const { value } = updateTaskFieldSchema.parse(await c.req.json())
    const result = await taxTaskService.updateField(c.get('user'), c.req.param('id')!, field, value)
    return successResponse<TaxTaskWriteResult>(c, FIELD_UPDATED_MESSAGE[field], result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Comments (any member who can see the task) ──

// GET /api/tax-tasks/:id/comments — threaded comments (top-level + replies).
taxTaskRoutes.get('/:id/comments', authWithPermission(), async (c) => {
  try {
    const result = await taxTaskCommentService.list(c.get('user'), c.req.param('id')!)
    return successResponse<TaskCommentListResponse>(c, taxTaskMessages.COMMENTS_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-tasks/:id/comments — add a comment or a one-level reply.
taxTaskRoutes.post('/:id/comments', authWithPermission(), async (c) => {
  try {
    const data = createTaskCommentSchema.parse(await c.req.json())
    const result = await taxTaskCommentService.create(c.get('user'), c.req.param('id')!, data)
    return successResponse<TaskCommentView>(c, taxTaskMessages.COMMENT_ADDED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-tasks/:id/comments/:commentId — edit own comment (author only).
taxTaskRoutes.patch('/:id/comments/:commentId', authWithPermission(), async (c) => {
  try {
    const data = updateTaskCommentSchema.parse(await c.req.json())
    const result = await taxTaskCommentService.update(
      c.get('user'),
      c.req.param('id')!,
      c.req.param('commentId')!,
      data,
    )
    return successResponse<TaskCommentView>(c, taxTaskMessages.COMMENT_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// DELETE /api/tax-tasks/:id/comments/:commentId — soft-delete own comment.
taxTaskRoutes.delete('/:id/comments/:commentId', authWithPermission(), async (c) => {
  try {
    const result = await taxTaskCommentService.remove(
      c.get('user'),
      c.req.param('id')!,
      c.req.param('commentId')!,
    )
    return successResponse<{ id: string }>(c, taxTaskMessages.COMMENT_DELETED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Activity (audit log) ──

// GET /api/tax-tasks/:id/activity — the task's activity trail. Gated by
// TAX_TASK.VIEW_ACTIVITY; the service also requires the caller can see the task.
taxTaskRoutes.get(
  '/:id/activity',
  authWithPermission(PERMISSIONS.TAX_TASK.VIEW_ACTIVITY),
  async (c) => {
    try {
      const result = await taxTaskActivityService.list(c.get('user'), c.req.param('id')!)
      return successResponse<TaskActivityListResponse>(c, taxTaskMessages.ACTIVITY_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)
