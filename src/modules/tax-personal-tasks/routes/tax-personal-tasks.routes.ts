import { Hono } from 'hono'
import { personalTaskService } from '../services/tax-personal-tasks.service'
import { personalTaskMessages } from '../config/tax-personal-tasks.messages'
import {
  createPersonalTaskSchema,
  updatePersonalTaskSchema,
  updatePersonalTaskStatusSchema,
  setFollowersSchema,
  createNoteSchema,
  updateNoteSchema,
  listPersonalTasksQuerySchema,
} from '../config/tax-personal-tasks.schema'
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
} from '../types/tax-personal-tasks.types'

// Tax Practice PERSONAL tasks (department-scoped). Every route is gated by the
// single TAX_PERSONAL_TASK.ACCESS permission; visibility (creator or follower) is
// enforced per row in the service. No delete route yet (deferred).
const ACCESS = PERMISSIONS.TAX_PERSONAL_TASK.ACCESS

export const taxPersonalTaskRoutes = new Hono<AppEnv>()

// GET /api/tax-personal-tasks — MY personal tasks (creator or follower), filtered.
taxPersonalTaskRoutes.get('/', authWithPermission(ACCESS), async (c) => {
  try {
    const query = listPersonalTasksQuerySchema.parse(c.req.query())
    const result = await personalTaskService.list(c.get('user'), query)
    return successResponse<PersonalTaskListResponse>(c, personalTaskMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-personal-tasks/members — members that can be added as followers.
// Declared before /:id so the static segment wins.
taxPersonalTaskRoutes.get('/members', authWithPermission(ACCESS), async (c) => {
  try {
    const result = await personalTaskService.memberOptions()
    return successResponse<PersonalTaskMemberOption[]>(c, personalTaskMessages.MEMBER_OPTIONS_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-personal-tasks — create. created_by = caller; optional followers.
taxPersonalTaskRoutes.post('/', authWithPermission(ACCESS), async (c) => {
  try {
    const data = createPersonalTaskSchema.parse(await c.req.json())
    const result = await personalTaskService.create(c.get('user'), data)
    return successResponse<PersonalTaskDetail>(c, personalTaskMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-personal-tasks/:id — one task (incl. notes + followers).
taxPersonalTaskRoutes.get('/:id', authWithPermission(ACCESS), async (c) => {
  try {
    const result = await personalTaskService.getById(c.get('user'), c.req.param('id')!)
    return successResponse<PersonalTaskDetail>(c, personalTaskMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-personal-tasks/:id/status — status only (board drag). Before
// the general /:id patch so the static segment wins.
taxPersonalTaskRoutes.patch('/:id/status', authWithPermission(ACCESS), async (c) => {
  try {
    const { status } = updatePersonalTaskStatusSchema.parse(await c.req.json())
    const result = await personalTaskService.changeStatus(c.get('user'), c.req.param('id')!, status)
    return successResponse<PersonalTaskDetail>(c, personalTaskMessages.STATUS_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/tax-personal-tasks/:id/followers — replace the follower set.
taxPersonalTaskRoutes.put('/:id/followers', authWithPermission(ACCESS), async (c) => {
  try {
    const { follower_ids } = setFollowersSchema.parse(await c.req.json())
    const result = await personalTaskService.setFollowers(c.get('user'), c.req.param('id')!, follower_ids)
    return successResponse<PersonalTaskDetail>(c, personalTaskMessages.FOLLOWERS_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-personal-tasks/:id/notes — the task's notes.
taxPersonalTaskRoutes.get('/:id/notes', authWithPermission(ACCESS), async (c) => {
  try {
    const result = await personalTaskService.listNotes(c.get('user'), c.req.param('id')!)
    return successResponse<PersonalTaskNote[]>(c, personalTaskMessages.NOTES_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-personal-tasks/:id/notes — add a note.
taxPersonalTaskRoutes.post('/:id/notes', authWithPermission(ACCESS), async (c) => {
  try {
    const data = createNoteSchema.parse(await c.req.json())
    const result = await personalTaskService.addNote(c.get('user'), c.req.param('id')!, data)
    return successResponse<PersonalTaskNote>(c, personalTaskMessages.NOTE_ADDED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-personal-tasks/:id/notes/:noteId — edit a note (any party).
taxPersonalTaskRoutes.patch('/:id/notes/:noteId', authWithPermission(ACCESS), async (c) => {
  try {
    const data = updateNoteSchema.parse(await c.req.json())
    const result = await personalTaskService.updateNote(
      c.get('user'),
      c.req.param('id')!,
      c.req.param('noteId')!,
      data,
    )
    return successResponse<PersonalTaskNote>(c, personalTaskMessages.NOTE_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/tax-personal-tasks/:id — edit fields (title/description/status/due_date).
// Registered AFTER the static /:id/* routes so those win.
taxPersonalTaskRoutes.patch('/:id', authWithPermission(ACCESS), async (c) => {
  try {
    const data = updatePersonalTaskSchema.parse(await c.req.json())
    const result = await personalTaskService.update(c.get('user'), c.req.param('id')!, data)
    return successResponse<PersonalTaskDetail>(c, personalTaskMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
