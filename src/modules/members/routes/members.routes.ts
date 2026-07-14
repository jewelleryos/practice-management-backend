import { Hono } from 'hono'
import { memberService } from '../services/members.service'
import { memberMessages } from '../config/members.messages'
import {
  createMemberSchema,
  updateMemberSchema,
  updateMemberStatusSchema,
} from '../config/members.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { MemberDetail, MemberListResponse } from '../types/members.types'

export const memberRoutes = new Hono<AppEnv>()

// GET /api/members — list all members with role, departments and firm counts
memberRoutes.get('/', authWithPermission(PERMISSIONS.MEMBER.READ), async (c) => {
  try {
    const result = await memberService.list()
    return successResponse<MemberListResponse>(c, memberMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// ── Tax-client "for" routes ──
// Active-member options (assignee dropdowns) for the tax-client add / edit
// screens. Permission detached from MEMBER.READ; gated on the tax-client
// action. Before /:id.
const membersForTaxClient = async (c: any) => {
  try {
    const result = await memberService.forTaxClient()
    return successResponse(c, memberMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
}
memberRoutes.get('/for-tax-client', authWithPermission(PERMISSIONS.TAX_CLIENT.CREATE), membersForTaxClient)
memberRoutes.get('/for-tax-client-edit', authWithPermission(PERMISSIONS.TAX_CLIENT.UPDATE), membersForTaxClient)
// Same active-member options for the task create form (preparer / reviewer
// pickers). Gated on TAX_TASK.CREATE so a create-only member can load them.
memberRoutes.get('/for-tax-task', authWithPermission(PERMISSIONS.TAX_TASK.CREATE), membersForTaxClient)

// GET /api/members/:id — full detail (role, departments, firms, permissions)
memberRoutes.get('/:id', authWithPermission(PERMISSIONS.MEMBER.READ), async (c) => {
  try {
    const result = await memberService.getById(c.req.param('id')!)
    return successResponse<MemberDetail>(c, memberMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/members — create (admin sets the initial password)
memberRoutes.post('/', authWithPermission(PERMISSIONS.MEMBER.CREATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = createMemberSchema.parse(body)
    const result = await memberService.create(data)
    return successResponse<MemberDetail>(c, memberMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/members/:id — update (self-edit of role/permissions needs code 105)
memberRoutes.put('/:id', authWithPermission(PERMISSIONS.MEMBER.UPDATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = updateMemberSchema.parse(body)
    const result = await memberService.update(c.req.param('id')!, data, c.get('user'))
    return successResponse<MemberDetail>(c, memberMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PATCH /api/members/:id/status — activate / deactivate (no hard delete)
memberRoutes.patch('/:id/status', authWithPermission(PERMISSIONS.MEMBER.DEACTIVATE), async (c) => {
  try {
    const body = await c.req.json()
    const { is_active } = updateMemberStatusSchema.parse(body)
    const result = await memberService.setStatus(c.req.param('id')!, is_active, c.get('user'))
    return successResponse<MemberDetail>(c, memberMessages.STATUS_UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
