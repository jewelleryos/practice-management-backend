import { Hono } from 'hono'
import { loanTypeService } from '../services/loan-types.service'
import { loanTypeMessages } from '../config/loan-types.messages'
import { createLoanTypeSchema, updateLoanTypeSchema } from '../config/loan-types.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { LoanType, LoanTypeListResponse } from '../types/loan-types.types'

// Loan types are practice-wide master data. There is NO delete route yet — loan
// types cannot be deleted (deferred; see root CLAUDE.md). The mortgage-task "for"
// options route is added with the mortgage-task module (gated on MORTGAGE_TASK.CREATE).
export const loanTypeRoutes = new Hono<AppEnv>()

// GET /api/loan-types — list all
loanTypeRoutes.get('/', authWithPermission(PERMISSIONS.LOAN_TYPE.READ), async (c) => {
  try {
    const result = await loanTypeService.list()
    return successResponse<LoanTypeListResponse>(c, loanTypeMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/loan-types/:id — one loan type
loanTypeRoutes.get('/:id', authWithPermission(PERMISSIONS.LOAN_TYPE.READ), async (c) => {
  try {
    const result = await loanTypeService.getById(c.req.param('id')!)
    return successResponse<LoanType>(c, loanTypeMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/loan-types — create
loanTypeRoutes.post('/', authWithPermission(PERMISSIONS.LOAN_TYPE.CREATE), async (c) => {
  try {
    const data = createLoanTypeSchema.parse(await c.req.json())
    const result = await loanTypeService.create(data)
    return successResponse<LoanType>(c, loanTypeMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/loan-types/:id — update
loanTypeRoutes.put('/:id', authWithPermission(PERMISSIONS.LOAN_TYPE.UPDATE), async (c) => {
  try {
    const data = updateLoanTypeSchema.parse(await c.req.json())
    const result = await loanTypeService.update(c.req.param('id')!, data)
    return successResponse<LoanType>(c, loanTypeMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
