import { Hono } from 'hono'
import { mortgageTaskService } from '../services/mortgage-tasks.service'
import { mortgageTaskCommentService } from '../services/mortgage-task-comments.service'
import { mortgageTaskMessages } from '../config/mortgage-tasks.messages'
import {
  createMortgageTaskSchema,
  updateMortgageTaskSchema,
  changeMortgageTaskStatusSchema,
  setMortgageTaskFollowersSchema,
  createMortgageTaskNoteSchema,
  updateMortgageTaskNoteSchema,
  createMortgageTaskCommentSchema,
  updateMortgageTaskCommentSchema,
  listMortgageTasksQuerySchema,
} from '../config/mortgage-tasks.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type {
  MortgageTaskListResponse,
  MortgageTaskDetail,
  MortgageTaskNote,
  MortgageTaskMemberOption,
  MortgageTaskActivityListResponse,
  MortgageTaskCommentView,
  MortgageTaskCommentListResponse,
} from '../types/mortgage-tasks.types'

// Mortgage service tasks (department-scoped). Route-level gate is VIEW for reads +
// writes (module access); VIEW_ALL widens the scope inside the service; every /:id
// handler calls loadVisibleRow (visibility = writability). create gates on CREATE;
// activity gates on VIEW_ACTIVITY. No delete route yet (deferred).
export const mortgageTaskRoutes = new Hono<AppEnv>()

// GET /api/mortgage-tasks — list (VIEW_ALL widens scope in the service)
mortgageTaskRoutes.get('/', authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW), async (c) => {
  try {
    const query = listMortgageTasksQuerySchema.parse(c.req.query())
    const result = await mortgageTaskService.list(c.get('user'), query)
    return successResponse<MortgageTaskListResponse>(c, mortgageTaskMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/mortgage-tasks/member-options?firm_id= — follower picker (members with
// access to that firm). Declared before /:id so the static segment wins.
mortgageTaskRoutes.get(
  '/member-options',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const firmId = c.req.query('firm_id')
      if (!firmId) {
        throw new AppError(mortgageTaskMessages.FIRM_REQUIRED, HTTP_STATUS.BAD_REQUEST)
      }
      const result = await mortgageTaskService.memberOptionsForFirm(c.get('user'), firmId)
      return successResponse<MortgageTaskMemberOption[]>(
        c,
        mortgageTaskMessages.MEMBER_OPTIONS_FETCHED,
        result,
      )
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// POST /api/mortgage-tasks — create (created_by = caller; validates firm access)
mortgageTaskRoutes.post('/', authWithPermission(PERMISSIONS.MORTGAGE_TASK.CREATE), async (c) => {
  try {
    const data = createMortgageTaskSchema.parse(await c.req.json())
    const result = await mortgageTaskService.create(c.get('user'), data)
    return successResponse<MortgageTaskDetail>(c, mortgageTaskMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/mortgage-tasks/:id/activity — activity log (VIEW_ACTIVITY + can see task).
// Before /:id so the static segment wins.
mortgageTaskRoutes.get(
  '/:id/activity',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW_ACTIVITY),
  async (c) => {
    try {
      const result = await mortgageTaskService.listActivity(c.get('user'), c.req.param('id')!)
      return successResponse<MortgageTaskActivityListResponse>(
        c,
        mortgageTaskMessages.ACTIVITY_FETCHED,
        result,
      )
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// PATCH /api/mortgage-tasks/:id/status — change status (writes a status-change note)
mortgageTaskRoutes.patch(
  '/:id/status',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const data = changeMortgageTaskStatusSchema.parse(await c.req.json())
      const result = await mortgageTaskService.changeStatus(c.get('user'), c.req.param('id')!, data)
      return successResponse<MortgageTaskDetail>(c, mortgageTaskMessages.STATUS_UPDATED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// PUT /api/mortgage-tasks/:id/followers — replace the follower set
mortgageTaskRoutes.put(
  '/:id/followers',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const { follower_ids } = setMortgageTaskFollowersSchema.parse(await c.req.json())
      const result = await mortgageTaskService.setFollowers(
        c.get('user'),
        c.req.param('id')!,
        follower_ids,
      )
      return successResponse<MortgageTaskDetail>(c, mortgageTaskMessages.FOLLOWERS_UPDATED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// ── Comments (threaded discussion; any member who can see the task) ──

// GET /api/mortgage-tasks/:id/comments — threaded comments (top-level + replies)
mortgageTaskRoutes.get(
  '/:id/comments',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const result = await mortgageTaskCommentService.list(c.get('user'), c.req.param('id')!)
      return successResponse<MortgageTaskCommentListResponse>(c, mortgageTaskMessages.COMMENTS_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// POST /api/mortgage-tasks/:id/comments — add a comment or a one-level reply
mortgageTaskRoutes.post(
  '/:id/comments',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const data = createMortgageTaskCommentSchema.parse(await c.req.json())
      const result = await mortgageTaskCommentService.create(c.get('user'), c.req.param('id')!, data)
      return successResponse<MortgageTaskCommentView>(c, mortgageTaskMessages.COMMENT_ADDED, result, 201)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// PATCH /api/mortgage-tasks/:id/comments/:commentId — edit own comment (author only)
mortgageTaskRoutes.patch(
  '/:id/comments/:commentId',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const data = updateMortgageTaskCommentSchema.parse(await c.req.json())
      const result = await mortgageTaskCommentService.update(
        c.get('user'),
        c.req.param('id')!,
        c.req.param('commentId')!,
        data,
      )
      return successResponse<MortgageTaskCommentView>(c, mortgageTaskMessages.COMMENT_UPDATED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// DELETE /api/mortgage-tasks/:id/comments/:commentId — soft-delete own comment
mortgageTaskRoutes.delete(
  '/:id/comments/:commentId',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const result = await mortgageTaskCommentService.remove(
        c.get('user'),
        c.req.param('id')!,
        c.req.param('commentId')!,
      )
      return successResponse<{ id: string }>(c, mortgageTaskMessages.COMMENT_DELETED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// POST /api/mortgage-tasks/:id/notes — add a plain note
mortgageTaskRoutes.post(
  '/:id/notes',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const data = createMortgageTaskNoteSchema.parse(await c.req.json())
      const result = await mortgageTaskService.addNote(c.get('user'), c.req.param('id')!, data)
      return successResponse<MortgageTaskNote>(c, mortgageTaskMessages.NOTE_ADDED, result, 201)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// PUT /api/mortgage-tasks/:id/notes/:noteId — edit a plain note (author only)
mortgageTaskRoutes.put(
  '/:id/notes/:noteId',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      const data = updateMortgageTaskNoteSchema.parse(await c.req.json())
      const result = await mortgageTaskService.updateNote(
        c.get('user'),
        c.req.param('id')!,
        c.req.param('noteId')!,
        data,
      )
      return successResponse<MortgageTaskNote>(c, mortgageTaskMessages.NOTE_UPDATED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// DELETE /api/mortgage-tasks/:id/notes/:noteId — soft-delete a plain note (author only)
mortgageTaskRoutes.delete(
  '/:id/notes/:noteId',
  authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW),
  async (c) => {
    try {
      await mortgageTaskService.deleteNote(c.get('user'), c.req.param('id')!, c.req.param('noteId')!)
      return successResponse(c, mortgageTaskMessages.NOTE_DELETED, null)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/mortgage-tasks/:id — detail (+ notes + followers)
mortgageTaskRoutes.get('/:id', authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW), async (c) => {
  try {
    const result = await mortgageTaskService.getById(c.get('user'), c.req.param('id')!)
    return successResponse<MortgageTaskDetail>(c, mortgageTaskMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/mortgage-tasks/:id — edit core fields (loan type / client / institution / summary)
mortgageTaskRoutes.put('/:id', authWithPermission(PERMISSIONS.MORTGAGE_TASK.VIEW), async (c) => {
  try {
    const data = updateMortgageTaskSchema.parse(await c.req.json())
    const result = await mortgageTaskService.update(c.get('user'), c.req.param('id')!, data)
    return successResponse<MortgageTaskDetail>(c, mortgageTaskMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
