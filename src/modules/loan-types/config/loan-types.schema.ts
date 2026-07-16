import { z } from 'zod'
import { loanTypeMessages } from './loan-types.messages'

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const createLoanTypeSchema = z.object({
  name: z.string().trim().min(1, loanTypeMessages.NAME_REQUIRED).max(160),
  description: optionalDescription,
})

export const updateLoanTypeSchema = z.object({
  name: z.string().trim().min(1, loanTypeMessages.NAME_REQUIRED).max(160).optional(),
  description: optionalDescription,
})
