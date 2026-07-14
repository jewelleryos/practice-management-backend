import { z } from 'zod'
import { relationTypeMessages } from './relation-types.messages'

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const createRelationTypeSchema = z.object({
  name: z.string().trim().min(1, relationTypeMessages.NAME_REQUIRED).max(160),
  description: optionalDescription,
})

export const updateRelationTypeSchema = z.object({
  name: z.string().trim().min(1, relationTypeMessages.NAME_REQUIRED).max(160).optional(),
  description: optionalDescription,
})
