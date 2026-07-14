import { z } from 'zod'
import { memberMessages } from './members.messages'
import { ALL_DEPARTMENT_CODES, type DepartmentCode } from '../../../config/departments.constants'
import { ALL_PERMISSION_CODES } from '../../../config/permissions.constants'

const departmentEnum = z.enum(ALL_DEPARTMENT_CODES as [DepartmentCode, ...DepartmentCode[]], {
  errorMap: () => ({ message: memberMessages.INVALID_DEPARTMENTS }),
})

// Array of permission codes — every code must exist in the registry.
const permissionArray = z
  .array(z.number().int())
  .refine((codes) => codes.every((code) => ALL_PERMISSION_CODES.includes(code)), {
    message: memberMessages.INVALID_PERMISSIONS,
  })

// Optional phone: trims, and treats an empty string as "not provided" (null).
const optionalPhone = z
  .string()
  .trim()
  .max(25)
  .transform((v) => (v === '' ? null : v))
  .nullish()

const emailField = z.string().trim().toLowerCase().email(memberMessages.INVALID_EMAIL).max(255)
const passwordField = z.string().min(8, memberMessages.PASSWORD_TOO_SHORT).max(100)
const firstName = z.string().trim().min(1, memberMessages.FIRST_NAME_REQUIRED).max(100)
const lastName = z.string().trim().min(1, memberMessages.LAST_NAME_REQUIRED).max(100)
const firmIds = z.array(z.string().trim().min(1))

export const createMemberSchema = z.object({
  email: emailField,
  first_name: firstName,
  last_name: lastName,
  phone: optionalPhone,
  password: passwordField,
  role_id: z.string().trim().min(1, memberMessages.ROLE_REQUIRED),
  departments: z.array(departmentEnum).default([]),
  firm_ids: firmIds.default([]),
  extra_permissions: permissionArray.default([]),
  revoked_permissions: permissionArray.default([]),
})

export const updateMemberSchema = z.object({
  email: emailField.optional(),
  first_name: firstName.optional(),
  last_name: lastName.optional(),
  phone: optionalPhone,
  // Empty string means "leave the password unchanged".
  password: z.preprocess((v) => (v === '' ? undefined : v), passwordField.optional()),
  role_id: z.string().trim().min(1, memberMessages.ROLE_REQUIRED).optional(),
  departments: z.array(departmentEnum).optional(),
  firm_ids: firmIds.optional(),
  extra_permissions: permissionArray.optional(),
  revoked_permissions: permissionArray.optional(),
})

export const updateMemberStatusSchema = z.object({
  is_active: z.boolean(),
})
