import { Hono } from 'hono'
import { taxClientService } from '../services/tax-clients.service'
import { taxClientMessages } from '../config/tax-clients.messages'
import {
  createTaxClientSchema,
  updateTaxClientSchema,
  listTaxClientsQuerySchema,
  exportTaxClientsQuerySchema,
} from '../config/tax-clients.schema'
import {
  clientCsvService,
  IMPORT_MAX_BYTES,
} from '../services/client-csv.service'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type {
  TaxClientDetail,
  TaxClientListResponse,
  ImportPreview,
  ImportResult,
  TaxClientDeletionImpact,
} from '../types/tax-clients.types'
// A client's tasks are served here (nested under the client) but the logic lives
// in the tax-tasks module — reuse its scoped list service + schema.
import { taxTaskService } from '../../tax-tasks/services/tax-tasks.service'
import { listTaxTasksQuerySchema } from '../../tax-tasks/config/tax-tasks.schema'
import { taxTaskMessages } from '../../tax-tasks/config/tax-tasks.messages'
import type { TaxTaskListResponse } from '../../tax-tasks/types/tax-tasks.types'
// A client's engagement letters are listed/created here (nested under the client);
// per-letter operations + notes live in the engagement-letters module.
import { engagementLetterService } from '../../engagement-letters/services/engagement-letters.service'
import { createEngagementLetterSchema } from '../../engagement-letters/config/engagement-letters.schema'
import { engagementLetterMessages } from '../../engagement-letters/config/engagement-letters.messages'
import type {
  EngagementLetterListResponse,
  EngagementLetterDetail,
  EngagementLetterCreateContext,
} from '../../engagement-letters/types/engagement-letters.types'

// Tax Practice clients. Visibility is firm-scoped in the service: a member only
// sees / can act on clients belonging to firms they have access to. Delete is a
// CASCADING SOFT delete (TAX_CLIENT.DELETE) - see the service's remove().
export const taxClientRoutes = new Hono<AppEnv>()

// GET /api/tax-clients — server-driven list (pagination, filters, sort)
taxClientRoutes.get('/', authWithPermission(PERMISSIONS.TAX_CLIENT.READ), async (c) => {
  try {
    const query = listTaxClientsQuerySchema.parse(c.req.query())
    const result = await taxClientService.list(c.get('user'), query)
    return successResponse<TaxClientListResponse>(c, taxClientMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── CSV export / import ──
// These MUST stay above `GET /:id`: registered after it, Hono matches /export as
// an id and the export comes back as "Client not found".
//
// Two separate permissions - EXPORT reads the visible client list out to a file,
// IMPORT writes new clients in bulk. Neither is granted to any seeded role, so
// the whole feature is dormant until someone ticks it in Settings - Roles.

// GET /api/tax-clients/export - the current list, as a CSV. Read-only.
taxClientRoutes.get('/export', authWithPermission(PERMISSIONS.TAX_CLIENT.EXPORT), async (c) => {
  try {
    const query = exportTaxClientsQuerySchema.parse(c.req.query())
    const rows = await taxClientService.exportRows(c.get('user'), query)
    const csv = clientCsvService.buildCsv(rows)

    // Content-Disposition is not in the CORS exposed-headers list, so the browser
    // hides it from the frontend; it builds the same filename itself. The header
    // is here for anyone calling the endpoint directly.
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${clientCsvService.exportFilename(new Date())}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-clients/import/template - a blank file with just the header row,
// built from the SAME column constant the importer validates against, so the
// template can never drift from what the parser expects. Two path segments, so
// no clash with GET /export or GET /:id.
taxClientRoutes.get('/import/template', authWithPermission(PERMISSIONS.TAX_CLIENT.IMPORT), async (c) => {
  try {
    return new Response(clientCsvService.buildCsv([]), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="client-import-template.csv"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return errorHandler(error, c)
  }
})

// Pull the uploaded `file` field out of a multipart body and return its text,
// after the file-level checks that do not need to look inside it.
async function readUploadedCsv(c: any): Promise<string> {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    throw new AppError(taxClientMessages.IMPORT_FILE_REQUIRED, HTTP_STATUS.BAD_REQUEST)
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new AppError(taxClientMessages.IMPORT_FILE_NOT_CSV, HTTP_STATUS.BAD_REQUEST)
  }
  if (file.size > IMPORT_MAX_BYTES) {
    throw new AppError(taxClientMessages.IMPORT_FILE_TOO_LARGE, HTTP_STATUS.BAD_REQUEST)
  }
  if (file.size === 0) {
    throw new AppError(taxClientMessages.IMPORT_FILE_EMPTY, HTTP_STATUS.BAD_REQUEST)
  }
  return await file.text()
}

// POST /api/tax-clients/import/preview - parse + validate, return the preview.
// WRITES NOTHING. Declared before POST /import so the two-segment path wins.
taxClientRoutes.post('/import/preview', authWithPermission(PERMISSIONS.TAX_CLIENT.IMPORT), async (c) => {
  try {
    const csv = await readUploadedCsv(c)
    const { preview } = await clientCsvService.parseAndValidate(c.get('user'), csv)
    return successResponse<ImportPreview>(c, taxClientMessages.IMPORT_PREVIEW_READY, preview)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-clients/import - commit the file.
taxClientRoutes.post('/import', authWithPermission(PERMISSIONS.TAX_CLIENT.IMPORT), async (c) => {
  try {
    const csv = await readUploadedCsv(c)
    // Re-parsed and re-validated from scratch. The preview result is never
    // trusted: the file could have been swapped between the two calls, or the
    // data it references could have changed underneath it.
    const { preview, clients } = await clientCsvService.parseAndValidate(c.get('user'), csv)
    if (preview.file_errors.length > 0) {
      throw new AppError(preview.file_errors[0]!, HTTP_STATUS.BAD_REQUEST)
    }
    if (!preview.can_import) {
      throw new AppError(taxClientMessages.IMPORT_HAS_ERRORS, HTTP_STATUS.BAD_REQUEST, preview)
    }
    const result = await taxClientService.importRows(c.get('user'), clients)
    return successResponse<ImportResult>(c, taxClientMessages.IMPORT_COMPLETED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Relationship-picker "for" routes ──
// Existing (firm-scoped) clients to relate to, for the add / edit client form.
// Create form gates on CREATE, edit form on UPDATE. Declared before /:id.
const clientsForRelationship = async (c: any) => {
  try {
    const result = await taxClientService.optionsForRelationship(c.get('user'))
    return successResponse(c, taxClientMessages.OPTIONS_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
taxClientRoutes.get('/for-relationship', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), clientsForRelationship)
taxClientRoutes.get('/for-relationship-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), clientsForRelationship)

// GET /api/tax-clients/for-tax-task — firm-scoped clients + their services, for the
// GLOBAL task-create drawers' client picker. Gated on TAX_TASK.CREATE (permission-
// detached, mirrors the other /for-tax-task option routes). Declared before /:id.
taxClientRoutes.get('/for-tax-task', authWithPermission(PERMISSIONS.TAX_TASK.CREATE), async (c) => {
  try {
    const result = await taxClientService.optionsForTaxTask(c.get('user'))
    return successResponse(c, taxClientMessages.OPTIONS_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-clients/:id — one client with its relationships, services and notes
taxClientRoutes.get('/:id', authWithPermission(PERMISSIONS.TAX_CLIENT.READ), async (c) => {
  try {
    const result = await taxClientService.getById(c.get('user'), c.req.param('id')!)
    return successResponse<TaxClientDetail>(c, taxClientMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-clients/:clientId/tax-tasks — a single client's tasks (the client
// profile Tasks tab). Same scoped/filtered/paginated list as /api/tax-tasks, but
// pinned to this client via the URL. The global task module keeps /api/tax-tasks.
// Login-only here; task visibility (firm scope + VIEW_ALL/VIEW_ASSIGNED) is enforced
// inside taxTaskService.list. Two path segments, so no clash with GET /:id.
taxClientRoutes.get('/:clientId/tax-tasks', authWithPermission(), async (c) => {
  try {
    const query = listTaxTasksQuerySchema.parse({
      ...c.req.query(),
      client_id: c.req.param('clientId')!,
    })
    const result = await taxTaskService.list(c.get('user'), query)
    return successResponse<TaxTaskListResponse>(c, taxTaskMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Engagement letters (nested under a client) ──
// Gated by the single TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS permission (firm-scoping
// enforced in the service). Two path segments, so no clash with GET/PUT /:id.

// GET /api/tax-clients/:clientId/engagement-letters/preflight — what the create
// screen needs before showing the form (firm has a letter head? + template defs).
taxClientRoutes.get(
  '/:clientId/engagement-letters/preflight',
  authWithPermission(PERMISSIONS.TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS),
  async (c) => {
    try {
      const result = await engagementLetterService.createContext(c.get('user'), c.req.param('clientId')!)
      return successResponse<EngagementLetterCreateContext>(c, engagementLetterMessages.PREFLIGHT_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/tax-clients/:clientId/engagement-letters — a client's letters (newest first)
taxClientRoutes.get('/:clientId/engagement-letters', authWithPermission(PERMISSIONS.TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS), async (c) => {
  try {
    const result = await engagementLetterService.list(c.get('user'), c.req.param('clientId')!)
    return successResponse<EngagementLetterListResponse>(c, engagementLetterMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-clients/:clientId/engagement-letters — create a letter for the client
taxClientRoutes.post('/:clientId/engagement-letters', authWithPermission(PERMISSIONS.TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS), async (c) => {
  try {
    const data = createEngagementLetterSchema.parse(await c.req.json())
    const result = await engagementLetterService.create(c.get('user'), c.req.param('clientId')!, data)
    return successResponse<EngagementLetterDetail>(c, engagementLetterMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/tax-clients — create (core fields + nested relationships/services/notes)
taxClientRoutes.post('/', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), async (c) => {
  try {
    const data = createTaxClientSchema.parse(await c.req.json())
    const result = await taxClientService.create(c.get('user'), data)
    return successResponse<TaxClientDetail>(c, taxClientMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/tax-clients/:id — update core fields
taxClientRoutes.put('/:id', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), async (c) => {
  try {
    const data = updateTaxClientSchema.parse(await c.req.json())
    const result = await taxClientService.update(c.get('user'), c.req.param('id')!, data)
    return successResponse<TaxClientDetail>(c, taxClientMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/tax-clients/:id/deletion-impact — counts of what a delete would remove,
// for the confirm dialog. Its own route rather than a field on GET /:id so the normal
// profile load does not pay for six COUNT queries on every open. Two path segments,
// so no clash with GET /:id.
taxClientRoutes.get(
  '/:id/deletion-impact',
  authWithPermission(PERMISSIONS.TAX_CLIENT.DELETE),
  async (c) => {
    try {
      const result = await taxClientService.deletionImpact(c.get('user'), c.req.param('id')!)
      return successResponse<TaxClientDeletionImpact>(
        c,
        taxClientMessages.DELETION_IMPACT_FETCHED,
        result,
      )
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// DELETE /api/tax-clients/:id — cascading soft delete of the client and everything
// it owns. Nothing is physically removed.
taxClientRoutes.delete('/:id', authWithPermission(PERMISSIONS.TAX_CLIENT.DELETE), async (c) => {
  try {
    await taxClientService.remove(c.get('user'), c.req.param('id')!)
    return successResponse(c, taxClientMessages.DELETED, null)
  } catch (error) {
    return errorHandler(error, c)
  }
})
