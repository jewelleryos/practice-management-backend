import { Hono } from 'hono'
import { relationTypeService } from '../services/relation-types.service'
import { relationTypeMessages } from '../config/relation-types.messages'
import { createRelationTypeSchema, updateRelationTypeSchema } from '../config/relation-types.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { RelationType, RelationTypeListResponse } from '../types/relation-types.types'

// Relation types are practice-wide master data. There is NO delete route yet —
// relation types cannot be deleted (deferred; see root CLAUDE.md).
export const relationTypeRoutes = new Hono<AppEnv>()

// GET /api/relation-types — list all
relationTypeRoutes.get('/', authWithPermission(PERMISSIONS.RELATION_TYPE.READ), async (c) => {
  try {
    const result = await relationTypeService.list()
    return successResponse<RelationTypeListResponse>(c, relationTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Relation-type options for the tax-client add / edit screens. Permission
// detached from RELATION_TYPE.READ; gated on the tax-client action. Before /:id.
const relationTypesForTaxClient = async (c: any) => {
  try {
    const result = await relationTypeService.forTaxClient()
    return successResponse(c, relationTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
relationTypeRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), relationTypesForTaxClient)
relationTypeRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), relationTypesForTaxClient)

// GET /api/relation-types/:id — one relation type
relationTypeRoutes.get('/:id', authWithPermission(PERMISSIONS.RELATION_TYPE.READ), async (c) => {
  try {
    const result = await relationTypeService.getById(c.req.param('id')!)
    return successResponse<RelationType>(c, relationTypeMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/relation-types — create
relationTypeRoutes.post('/', authWithPermission(PERMISSIONS.RELATION_TYPE.CREATE), async (c) => {
  try {
    const data = createRelationTypeSchema.parse(await c.req.json())
    const result = await relationTypeService.create(data)
    return successResponse<RelationType>(c, relationTypeMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/relation-types/:id — update
relationTypeRoutes.put('/:id', authWithPermission(PERMISSIONS.RELATION_TYPE.UPDATE), async (c) => {
  try {
    const data = updateRelationTypeSchema.parse(await c.req.json())
    const result = await relationTypeService.update(c.req.param('id')!, data)
    return successResponse<RelationType>(c, relationTypeMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
