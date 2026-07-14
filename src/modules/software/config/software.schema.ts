import { z } from 'zod'
import { softwareMessages } from './software.messages'

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const createSoftwareSchema = z.object({
  name: z.string().trim().min(1, softwareMessages.NAME_REQUIRED).max(160),
  description: optionalDescription,
})

export const updateSoftwareSchema = z.object({
  name: z.string().trim().min(1, softwareMessages.NAME_REQUIRED).max(160).optional(),
  description: optionalDescription,
})
