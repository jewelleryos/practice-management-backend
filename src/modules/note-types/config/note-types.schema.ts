import { z } from 'zod'
import { noteTypeMessages } from './note-types.messages'

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const createNoteTypeSchema = z.object({
  name: z.string().trim().min(1, noteTypeMessages.NAME_REQUIRED).max(160),
  description: optionalDescription,
  is_sensitive: z.boolean().default(false),
})

export const updateNoteTypeSchema = z.object({
  name: z.string().trim().min(1, noteTypeMessages.NAME_REQUIRED).max(160).optional(),
  description: optionalDescription,
  is_sensitive: z.boolean().optional(),
})
