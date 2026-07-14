import { z } from 'zod'
import { serviceChecklistMessages } from './service-checklists.messages'

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const createServiceChecklistItemSchema = z.object({
  service_id: z.string().trim().min(1, serviceChecklistMessages.SERVICE_REQUIRED),
  heading: z.string().trim().min(1, serviceChecklistMessages.HEADING_REQUIRED).max(200),
  description: optionalDescription,
  is_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

export const updateServiceChecklistItemSchema = z.object({
  heading: z.string().trim().min(1, serviceChecklistMessages.HEADING_REQUIRED).max(200).optional(),
  description: optionalDescription,
  is_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
})
