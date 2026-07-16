import { Hono } from 'hono'
import { mortgagePersonalTaskService } from '../services/mortgage-personal-tasks.service'
import { mortgagePersonalTaskMessages } from '../config/mortgage-personal-tasks.messages'
import {
  createPersonalTaskSchema,
  updatePersonalTaskSchema,
  updatePersonalTaskStatusSchema,
  setFollowersSchema,
  createNoteSchema,
  updateNoteSchema,
  listPersonalTasksQuerySchema,
} from '../config/mortgage-personal-tasks.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type {
  PersonalTaskListResponse,
  PersonalTaskDetail,
  PersonalTaskNote,
  PersonalTaskMemberOption,
} from '../types/mortgage-personal-tasks.types'

// Mortgage PERSONAL tasks (department-scoped). Every route is gated by the single
// MORTGAGE_PERSONAL_TASK.ACCESS permission; visibility (creator or follower) is
// enforced per row in the service. No delete route yet (deferred).
const ACCESS = PERMISSIONS.MORTGAGE_PERSONAL_TASK.ACCESS

export const mortgagePersonalTaskRoutes = new Hono<AppEnv>()

// GET /api/mortgage-personal-tasks — MY personal tasks (creator or follower), filtered.
mortgagePersonalTaskRoutes.get('/', authWithPermission(ACCESS), async (c) => {
  try {
    const query = listPersonalTasksQuerySchema.parse(c.req.query())
    const result = await mortgagePersonalTaskService.list(c.get('user'), query)
    return successResponse<PersonalTaskListResponse>(c, mortgagePersonalTaskMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/mortgage-personal-tasks/members — members that can be added as followers.
// Declared before /:id so the static segment wins.
mortgagePersonalTaskRoutes.get('/members', authWithPermission(ACCESS), async (c) => {
  try {
    const result = await mortgagePersonalTaskService.memberOptions()
    return successResponse<PersonalTaskMemberOption[]>(c, mortgagePersonalTaskMessages.MEMBER_OPTIONS_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/mortgage-personal-tasks — create. created_by = caller; optional followers.
mortgagePersonalTaskRoutes.post('/', authWithPermission(ACCESS), async (c) => {
  try {
    const data = createPersonalTaskSchema.parse(await c.req.json())
    const result = await mortgagePersonalTaskService.create(c.get('user'), data)
    return successResponse<PersonalTaskDetail>(c, mortgagePersonalTaskMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/mortgage-personal-tasks/:id — one task (incl. notes + followers).
mortgagePersonalTaskRoutes.get('/:id', authWithPermission(ACCESS), async (c) => {
  try {
    const result = await mortgagePersonalTaskService.getById(c.get('user'), c.req.param('id')!)
    return successResponse<PersonalTaskDetail>(c, mortgagePersonalTaskMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/mortgage-personal-tasks/:id/status — status only (board drag).
mortgagePersonalTaskRoutes.patch('/:id/status', authWithPermission(ACCESS), async (c) => {
  try {
    const { status } = updatePersonalTaskStatusSchema.parse(await c.req.json())
    const result = await mortgagePersonalTaskService.changeStatus(c.get('user'), c.req.param('id')!, status)
    return successResponse<PersonalTaskDetail>(c, mortgagePersonalTaskMessages.STATUS_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/mortgage-personal-tasks/:id/followers — replace the follower set.
mortgagePersonalTaskRoutes.put('/:id/followers', authWithPermission(ACCESS), async (c) => {
  try {
    const { follower_ids } = setFollowersSchema.parse(await c.req.json())
    const result = await mortgagePersonalTaskService.setFollowers(c.get('user'), c.req.param('id')!, follower_ids)
    return successResponse<PersonalTaskDetail>(c, mortgagePersonalTaskMessages.FOLLOWERS_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/mortgage-personal-tasks/:id/notes — the task's notes.
mortgagePersonalTaskRoutes.get('/:id/notes', authWithPermission(ACCESS), async (c) => {
  try {
    const result = await mortgagePersonalTaskService.listNotes(c.get('user'), c.req.param('id')!)
    return successResponse<PersonalTaskNote[]>(c, mortgagePersonalTaskMessages.NOTES_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/mortgage-personal-tasks/:id/notes — add a note.
mortgagePersonalTaskRoutes.post('/:id/notes', authWithPermission(ACCESS), async (c) => {
  try {
    const data = createNoteSchema.parse(await c.req.json())
    const result = await mortgagePersonalTaskService.addNote(c.get('user'), c.req.param('id')!, data)
    return successResponse<PersonalTaskNote>(c, mortgagePersonalTaskMessages.NOTE_ADDED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/mortgage-personal-tasks/:id/notes/:noteId — edit a note (any party).
mortgagePersonalTaskRoutes.patch('/:id/notes/:noteId', authWithPermission(ACCESS), async (c) => {
  try {
    const data = updateNoteSchema.parse(await c.req.json())
    const result = await mortgagePersonalTaskService.updateNote(
      c.get('user'),
      c.req.param('id')!,
      c.req.param('noteId')!,
      data,
    )
    return successResponse<PersonalTaskNote>(c, mortgagePersonalTaskMessages.NOTE_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/mortgage-personal-tasks/:id — edit fields (title/description/status/due_date).
// Registered AFTER the static /:id/* routes so those win.
mortgagePersonalTaskRoutes.patch('/:id', authWithPermission(ACCESS), async (c) => {
  try {
    const data = updatePersonalTaskSchema.parse(await c.req.json())
    const result = await mortgagePersonalTaskService.update(c.get('user'), c.req.param('id')!, data)
    return successResponse<PersonalTaskDetail>(c, mortgagePersonalTaskMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
