import { Hono } from 'hono'
import { noteTypeService } from '../services/note-types.service'
import { noteTypeMessages } from '../config/note-types.messages'
import { createNoteTypeSchema, updateNoteTypeSchema } from '../config/note-types.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { NoteType, NoteTypeListResponse } from '../types/note-types.types'

// Note types are practice-wide master data. There is NO delete route yet —
// note types cannot be deleted (deferred; see root CLAUDE.md).
export const noteTypeRoutes = new Hono<AppEnv>()

// GET /api/note-types — list all
noteTypeRoutes.get('/', authWithPermission(PERMISSIONS.NOTE_TYPE.READ), async (c) => {
  try {
    const result = await noteTypeService.list()
    return successResponse<NoteTypeListResponse>(c, noteTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Note-type options for the tax-client add / edit screens. Permission detached
// from NOTE_TYPE.READ; gated on the tax-client action. Before /:id.
const noteTypesForTaxClient = async (c: any) => {
  try {
    const result = await noteTypeService.forTaxClient()
    return successResponse(c, noteTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
noteTypeRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), noteTypesForTaxClient)
noteTypeRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), noteTypesForTaxClient)

// GET /api/note-types/:id — one note type
noteTypeRoutes.get('/:id', authWithPermission(PERMISSIONS.NOTE_TYPE.READ), async (c) => {
  try {
    const result = await noteTypeService.getById(c.req.param('id')!)
    return successResponse<NoteType>(c, noteTypeMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/note-types — create
noteTypeRoutes.post('/', authWithPermission(PERMISSIONS.NOTE_TYPE.CREATE), async (c) => {
  try {
    const data = createNoteTypeSchema.parse(await c.req.json())
    const result = await noteTypeService.create(data)
    return successResponse<NoteType>(c, noteTypeMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/note-types/:id — update
noteTypeRoutes.put('/:id', authWithPermission(PERMISSIONS.NOTE_TYPE.UPDATE), async (c) => {
  try {
    const data = updateNoteTypeSchema.parse(await c.req.json())
    const result = await noteTypeService.update(c.req.param('id')!, data)
    return successResponse<NoteType>(c, noteTypeMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
