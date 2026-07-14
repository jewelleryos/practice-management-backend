import { z } from 'zod'
import { entityTypeMessages } from './entity-types.messages'

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const createEntityTypeSchema = z.object({
  name: z.string().trim().min(1, entityTypeMessages.NAME_REQUIRED).max(160),
  description: optionalDescription,
})

export const updateEntityTypeSchema = z.object({
  name: z.string().trim().min(1, entityTypeMessages.NAME_REQUIRED).max(160).optional(),
  description: optionalDescription,
})
