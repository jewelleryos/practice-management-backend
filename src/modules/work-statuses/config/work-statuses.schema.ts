import { z } from 'zod'
import { workStatusMessages } from './work-statuses.messages'

// A #RRGGBB hex colour. Stored/compared in a canonical form; the DB column is 7 chars.
const hexColor = z
  .string()
  .trim()
  .min(1, workStatusMessages.COLOR_REQUIRED)
  .regex(/^#[0-9a-fA-F]{6}$/, workStatusMessages.COLOR_INVALID)

export const createWorkStatusSchema = z.object({
  name: z.string().trim().min(1, workStatusMessages.NAME_REQUIRED).max(120),
  color: hexColor,
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
})

export const updateWorkStatusSchema = z.object({
  name: z.string().trim().min(1, workStatusMessages.NAME_REQUIRED).max(120).optional(),
  color: hexColor.optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
})
