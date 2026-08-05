import { Hono } from 'hono'
import { engagementLetterService } from '../services/engagement-letters.service'
import { engagementLetterMessages } from '../config/engagement-letters.messages'
import { addEngagementLetterNoteSchema } from '../config/engagement-letters.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type {
  EngagementLetterDetail,
  EngagementLetterNote,
  EngagementLetterNotesResponse,
  EngagementLetterTemplateInfo,
} from '../types/engagement-letters.types'

// Engagement letters — operations on a single letter (by id), its notes, and the
// current template's parameter defs. The client-nested list/create routes live in
// the tax-clients router. The whole feature is gated by the single
// TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS permission; firm-scoping is enforced in the
// service. Letters are immutable (no update) and notes are add-only.
export const engagementLetterRoutes = new Hono<AppEnv>()

const gate = PERMISSIONS.TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS

// GET /api/engagement-letters/templates/latest — parameter defs for the form.
// Declared before /:id (distinct static path).
engagementLetterRoutes.get('/templates/latest', authWithPermission(gate), async (c) => {
  try {
    const result = engagementLetterService.templateInfo()
    return successResponse<EngagementLetterTemplateInfo>(c, engagementLetterMessages.TEMPLATE_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/engagement-letters/:id — one letter.
engagementLetterRoutes.get('/:id', authWithPermission(gate), async (c) => {
  try {
    const result = await engagementLetterService.getById(c.get('user'), c.req.param('id')!)
    return successResponse<EngagementLetterDetail>(c, engagementLetterMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/engagement-letters/:id/pdf — regenerate and stream the PDF.
engagementLetterRoutes.get('/:id/pdf', authWithPermission(gate), async (c) => {
  try {
    const id = c.req.param('id')!
    const pdf = await engagementLetterService.generatePdf(c.get('user'), id)
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="engagement-letter-${id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/engagement-letters/:id/notes — a letter's notes.
engagementLetterRoutes.get('/:id/notes', authWithPermission(gate), async (c) => {
  try {
    const result = await engagementLetterService.listNotes(c.get('user'), c.req.param('id')!)
    return successResponse<EngagementLetterNotesResponse>(c, engagementLetterMessages.NOTES_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/engagement-letters/:id/notes — add a note.
engagementLetterRoutes.post('/:id/notes', authWithPermission(gate), async (c) => {
  try {
    const data = addEngagementLetterNoteSchema.parse(await c.req.json())
    const result = await engagementLetterService.addNote(c.get('user'), c.req.param('id')!, data)
    return successResponse<EngagementLetterNote>(c, engagementLetterMessages.NOTE_ADDED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})
