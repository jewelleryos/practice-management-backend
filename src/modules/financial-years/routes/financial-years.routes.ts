import { Hono } from 'hono'
import { financialYearService } from '../services/financial-years.service'
import { financialYearMessages } from '../config/financial-years.messages'
import {
  createFinancialYearSchema,
  updateFinancialYearSchema,
} from '../config/financial-years.schema'
import { successResponse } from '../../../utils/response'
import { errorHandler } from '../../../utils/error-handler'
import { authWithPermission } from '../../../middleware/auth.middleware'
import { PERMISSIONS } from '../../../config/permissions.constants'
import type { AppEnv } from '../../../types/hono.types'
import type { FinancialYear, FinancialYearListResponse } from '../types/financial-years.types'

// Financial years are practice-wide master data. There is NO delete route —
// financial years cannot be deleted yet (deferred; see root CLAUDE.md).
export const financialYearRoutes = new Hono<AppEnv>()

// GET /api/financial-years — list all financial years
financialYearRoutes.get('/', authWithPermission(PERMISSIONS.FINANCIAL_YEAR.READ), async (c) => {
  try {
    const result = await financialYearService.list()
    return successResponse<FinancialYearListResponse>(c, financialYearMessages.LIST_FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// GET /api/financial-years/for-tax-task — financial-year options for the tasks
// module (the create form AND the client Tasks / Work Status view screens).
// Permission-detached from FINANCIAL_YEAR.READ: authenticated-only, like the
// tax-tasks list route, so any task creator OR viewer can populate the FY
// selectors (a view-only member has neither CREATE nor FINANCIAL_YEAR.READ).
// FY labels are non-sensitive practice-wide master data. Declared before /:id.
financialYearRoutes.get('/for-tax-task', authWithPermission(), async (c) => {
    try {
      const result = await financialYearService.optionsForTaxTask()
      return successResponse(c, financialYearMessages.LIST_FETCHED, result)
    } catch (error) {
      return errorHandler(error, c)
    }
  },
)

// GET /api/financial-years/:id — one financial year
financialYearRoutes.get('/:id', authWithPermission(PERMISSIONS.FINANCIAL_YEAR.READ), async (c) => {
  try {
    const result = await financialYearService.getById(c.req.param('id')!)
    return successResponse<FinancialYear>(c, financialYearMessages.FETCHED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// POST /api/financial-years — create
financialYearRoutes.post('/', authWithPermission(PERMISSIONS.FINANCIAL_YEAR.CREATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = createFinancialYearSchema.parse(body)
    const result = await financialYearService.create(data)
    return successResponse<FinancialYear>(c, financialYearMessages.CREATED, result, 201)
  } catch (error) {
    return errorHandler(error, c)
  }
})

// PUT /api/financial-years/:id — update
financialYearRoutes.put('/:id', authWithPermission(PERMISSIONS.FINANCIAL_YEAR.UPDATE), async (c) => {
  try {
    const body = await c.req.json()
    const data = updateFinancialYearSchema.parse(body)
    const result = await financialYearService.update(c.req.param('id')!, data)
    return successResponse<FinancialYear>(c, financialYearMessages.UPDATED, result)
  } catch (error) {
    return errorHandler(error, c)
  }
})
