import { Hono } from 'hono'
import { entityTypeService } from '../services/entity-types.service'
import { entityTypeMessages } from '../config/entity-types.messages'
import { createEntityTypeSchema, updateEntityTypeSchema } from '../config/entity-types.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { EntityType, EntityTypeListResponse } from '../types/entity-types.types'

// Entity types are practice-wide master data. There is NO delete route yet —
// entity types cannot be deleted (deferred; see root CLAUDE.md).
export const entityTypeRoutes = new Hono<AppEnv>()

// GET /api/entity-types — list all
entityTypeRoutes.get('/', authWithPermission(PERMISSIONS.ENTITY_TYPE.READ), async (c) => {
  try {
    const result = await entityTypeService.list()
    return successResponse<EntityTypeListResponse>(c, entityTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Entity-type options for the tax-client add / edit / list-filter screens.
// Permission detached from ENTITY_TYPE.READ; gated on the tax-client action.
// Declared before /:id so they aren't swallowed by the param route.
const entityTypesForTaxClient = async (c: any) => {
  try {
    const result = await entityTypeService.forTaxClient()
    return successResponse(c, entityTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
entityTypeRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), entityTypesForTaxClient)
entityTypeRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), entityTypesForTaxClient)
entityTypeRoutes.get('/for-tax-client-list', authWithPermission(PERMISSIONS.TAX_CLIENT.READ), entityTypesForTaxClient)

// GET /api/entity-types/:id — one entity type
entityTypeRoutes.get('/:id', authWithPermission(PERMISSIONS.ENTITY_TYPE.READ), async (c) => {
  try {
    const result = await entityTypeService.getById(c.req.param('id')!)
    return successResponse<EntityType>(c, entityTypeMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/entity-types — create
entityTypeRoutes.post('/', authWithPermission(PERMISSIONS.ENTITY_TYPE.CREATE), async (c) => {
  try {
    const data = createEntityTypeSchema.parse(await c.req.json())
    const result = await entityTypeService.create(data)
    return successResponse<EntityType>(c, entityTypeMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/entity-types/:id — update
entityTypeRoutes.put('/:id', authWithPermission(PERMISSIONS.ENTITY_TYPE.UPDATE), async (c) => {
  try {
    const data = updateEntityTypeSchema.parse(await c.req.json())
    const result = await entityTypeService.update(c.req.param('id')!, data)
    return successResponse<EntityType>(c, entityTypeMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
