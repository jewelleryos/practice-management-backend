import { z } from 'zod'
import { financialYearMessages } from './financial-years.messages'

export const createFinancialYearSchema = z.object({
  year: z.string().trim().min(1, financialYearMessages.YEAR_REQUIRED).max(20),
  is_current: z.boolean().default(false),
})

export const updateFinancialYearSchema = z.object({
  year: z.string().trim().min(1, financialYearMessages.YEAR_REQUIRED).max(20).optional(),
  is_current: z.boolean().optional(),
})
