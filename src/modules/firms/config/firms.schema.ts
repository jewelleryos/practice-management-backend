import { z } from 'zod'
import { firmMessages } from './firms.messages'
import { ALL_DEPARTMENT_CODES, type DepartmentCode } from '../../../config/departments.constants'

const departmentEnum = z.enum(ALL_DEPARTMENT_CODES as [DepartmentCode, ...DepartmentCode[]], {
  errorMap: () => ({ message: firmMessages.INVALID_DEPARTMENT }),
})

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

// Optional email: empty → null, otherwise must be a valid, lower-cased address.
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().toLowerCase().email().nullish(),
)

const concernPersonSchema = z.object({
  name: z.string().trim().min(1, 'Concern person name is required').max(120),
  designation: optionalText(120),
  membership_number: optionalText(80),
  tax_agent_number: optionalText(80),
  asic_agent_id: optionalText(80),
})

export const createFirmSchema = z.object({
  department: departmentEnum,
  name: z.string().trim().min(1, firmMessages.NAME_REQUIRED).max(160),
  description: optionalText(1000),
  address: optionalText(500),
  email: optionalEmail,
  contact_no: optionalText(25),
  concern_persons: z.array(concernPersonSchema).default([]),
  is_active: z.boolean().default(true),
})

export const updateFirmSchema = z.object({
  name: z.string().trim().min(1, firmMessages.NAME_REQUIRED).max(160).optional(),
  description: optionalText(1000),
  address: optionalText(500),
  email: optionalEmail,
  contact_no: optionalText(25),
  concern_persons: z.array(concernPersonSchema).optional(),
  is_active: z.boolean().optional(),
})
