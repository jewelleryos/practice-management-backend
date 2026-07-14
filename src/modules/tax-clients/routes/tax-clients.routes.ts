import { Hono } from 'hono'
import { taxClientService } from '../services/tax-clients.service'
import { taxClientMessages } from '../config/tax-clients.messages'
import {
  createTaxClientSchema,
  updateTaxClientSchema,
  listTaxClientsQuerySchema,
} from '../config/tax-clients.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { TaxClientDetail, TaxClientListResponse } from '../types/tax-clients.types'
// A client's tasks are served here (nested under the client) but the logic lives
// in the tax-tasks module — reuse its scoped list service + schema.
import { taxTaskService } from '../../tax-tasks/services/tax-tasks.service'
import { listTaxTasksQuerySchema } from '../../tax-tasks/config/tax-tasks.schema'
import { taxTaskMessages } from '../../tax-tasks/config/tax-tasks.messages'
import type { TaxTaskListResponse } from '../../tax-tasks/types/tax-tasks.types'

// Tax Practice clients. Visibility is firm-scoped in the service: a member only
// sees / can act on clients belonging to firms they have access to. There is NO
// delete route yet (deferred; see root CLAUDE.md).
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
