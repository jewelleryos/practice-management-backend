import { z } from 'zod'
import { roleMessages } from './roles.messages'
import { ACCEPTED_PERMISSION_CODES } from '../../../config/permissions.constants'

const VALID_CODES = new Set(ACCEPTED_PERMISSION_CODES)

// Every code in the bundle must be one the registry knows about. That includes
// RETIRED codes: a role saved from the picker echoes back whatever it was loaded
// with, so rejecting a retired code would make any role still carrying one
// impossible to edit. Retired codes grant nothing.
const permissionsSchema = z
  .array(z.number().int())
  .refine((codes) => codes.every((c) => VALID_CODES.has(c)), {
    message: roleMessages.INVALID_PERMISSIONS,
  })

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, roleMessages.NAME_REQUIRED).max(80),
  description: z.string().trim().max(500).nullish(),
  permissions: permissionsSchema.default([]),
})

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1, roleMessages.NAME_REQUIRED).max(80).optional(),
  description: z.string().trim().max(500).nullish(),
  permissions: permissionsSchema.optional(),
})
