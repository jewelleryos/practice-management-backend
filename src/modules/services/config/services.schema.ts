import { z } from 'zod'
import { serviceMessages } from './services.messages'
import { isServiceFrequency, type ServiceFrequency } from '../../../config/service-frequencies.constants'
import { ALL_DEPARTMENT_CODES, type DepartmentCode } from '../../../config/departments.constants'

const departmentEnum = z.enum(ALL_DEPARTMENT_CODES as [DepartmentCode, ...DepartmentCode[]], {
  errorMap: () => ({ message: serviceMessages.INVALID_DEPARTMENT }),
})

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalDescription = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullish()

// One or more frequencies from the fixed set. Validated against the constant,
// de-duplicated, and normalised to the canonical ServiceFrequency[] shape.
const frequenciesSchema = z
  .array(z.string())
  .min(1, serviceMessages.FREQUENCIES_REQUIRED)
  .refine((arr) => arr.every(isServiceFrequency), { message: serviceMessages.FREQUENCIES_INVALID })
  .transform((arr) => [...new Set(arr)] as ServiceFrequency[])

export const createServiceSchema = z.object({
  department: departmentEnum,
  name: z.string().trim().min(1, serviceMessages.NAME_REQUIRED).max(160),
  code: z.string().trim().min(1, serviceMessages.CODE_REQUIRED).max(40),
  description: optionalDescription,
  frequencies: frequenciesSchema,
  // When true, this service is attached to every newly created client.
  auto_added: z.boolean().default(false),
})

export const updateServiceSchema = z.object({
  name: z.string().trim().min(1, serviceMessages.NAME_REQUIRED).max(160).optional(),
  code: z.string().trim().min(1, serviceMessages.CODE_REQUIRED).max(40).optional(),
  description: optionalDescription,
  frequencies: frequenciesSchema.optional(),
  auto_added: z.boolean().optional(),
})
