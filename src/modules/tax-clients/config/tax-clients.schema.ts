import { z } from 'zod'
import { taxClientMessages } from './tax-clients.messages'
import {
  SERVICE_FREQUENCY_VALUES,
  type ServiceFrequency,
} from '../../../config/service-frequencies.constants'

// Optional free-text: trims, treats '' as null, allows omitted/null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

const statusEnum = z.enum(['active', 'inactive'], {
  errorMap: () => ({ message: taxClientMessages.INVALID_STATUS }),
})

const frequencyEnum = z.enum(
  SERVICE_FREQUENCY_VALUES as unknown as [ServiceFrequency, ...ServiceFrequency[]],
  { errorMap: () => ({ message: taxClientMessages.SERVICE_FREQUENCY_INVALID }) },
)

// Date-only string (YYYY-MM-DD) or null.
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .nullish()
  .or(z.literal('').transform(() => null))

const relationshipSchema = z.object({
  relation_type_id: z.string().min(1, taxClientMessages.RELATION_TYPE_NOT_FOUND),
  related_client_id: z.string().min(1, taxClientMessages.RELATED_CLIENT_NOT_FOUND),
})

const serviceSchema = z.object({
  service_id: z.string().min(1, taxClientMessages.SERVICE_NOT_FOUND),
  frequency: frequencyEnum,
  short_description: optionalText(1000),
  assignee_id: z.string().trim().min(1).nullish(),
})

const noteSchema = z.object({
  note_type_id: z.string().min(1, taxClientMessages.NOTE_TYPE_NOT_FOUND),
  text: z.string().trim().min(1, taxClientMessages.NOTE_TEXT_REQUIRED).max(5000),
})

// On update, relationships and services may carry an `id` (an existing row to
// keep / update in place); without it they are treated as new rows to insert.
const relationshipEditSchema = relationshipSchema.extend({
  id: z.string().trim().min(1).optional(),
})
const serviceEditSchema = serviceSchema.extend({
  id: z.string().trim().min(1).optional(),
})

export const createTaxClientSchema = z.object({
  firm_id: z.string().min(1, taxClientMessages.FIRM_REQUIRED),
  name: z.string().trim().min(1, taxClientMessages.NAME_REQUIRED).max(200),
  is_company: z.boolean().default(false),
  gender: optionalText(40),
  title: optionalText(40),
  entity_type_id: z.string().trim().min(1).nullish(),
  dob_or_incorporation_date: optionalDate,
  abn: optionalText(20),
  acn: optionalText(20),
  trading_name: optionalText(200),
  bank_account_name: optionalText(200),
  bank_account_prefix: optionalText(3),
  bank_account_number: optionalText(9),
  director_id: optionalText(50),
  client_group_id: z.string().trim().min(1).nullish(),
  software_id: z.string().trim().min(1).nullish(),
  assignee_id: z.string().trim().min(1).nullish(),
  status: statusEnum.default('active'),
  relationships: z.array(relationshipSchema).default([]),
  services: z.array(serviceSchema).default([]),
  notes: z.array(noteSchema).default([]),
})

export const updateTaxClientSchema = z.object({
  firm_id: z.string().min(1, taxClientMessages.FIRM_REQUIRED).optional(),
  name: z.string().trim().min(1, taxClientMessages.NAME_REQUIRED).max(200).optional(),
  is_company: z.boolean().optional(),
  gender: optionalText(40),
  title: optionalText(40),
  entity_type_id: z.string().trim().min(1).nullish(),
  dob_or_incorporation_date: optionalDate,
  abn: optionalText(20),
  acn: optionalText(20),
  trading_name: optionalText(200),
  bank_account_name: optionalText(200),
  bank_account_prefix: optionalText(3),
  bank_account_number: optionalText(9),
  director_id: optionalText(50),
  client_group_id: z.string().trim().min(1).nullish(),
  software_id: z.string().trim().min(1).nullish(),
  assignee_id: z.string().trim().min(1).nullish(),
  status: statusEnum.optional(),
  // Optional child collections. When present they are reconciled: relationships
  // & services by id (kept / updated / soft-deleted), notes are appended.
  relationships: z.array(relationshipEditSchema).optional(),
  services: z.array(serviceEditSchema).optional(),
  notes: z.array(noteSchema).optional(),
})

// Query params for the server-driven list. Values arrive as strings.
export const listTaxClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  entity_type_id: z.string().trim().min(1).optional(),
  client_group_id: z.string().trim().min(1).optional(),
  firm_id: z.string().trim().min(1).optional(),
  status: statusEnum.optional(),
  sort_by: z.enum(['name', 'created_at']).default('name'),
  sort_dir: z.enum(['asc', 'desc']).default('asc'),
})
