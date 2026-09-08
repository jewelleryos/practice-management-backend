import { z } from 'zod'
import { csvOf } from '../../../utils/query-filters'
import { taxClientMessages } from './tax-clients.messages'
import {
  SERVICE_FREQUENCY_VALUES,
  type ServiceFrequency,
} from '../../../config/service-frequencies.constants'
import {
  AUSTRALIAN_STATE_CODES,
  type AustralianStateCode,
} from '../../../config/australian-states.constants'

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

// Australian state CODE (NSW/VIC/…) or null. Empty string is treated as null.
// The full state name is derived from this code in the service and stored too.
const stateEnum = z.enum(
  AUSTRALIAN_STATE_CODES as unknown as [AustralianStateCode, ...AustralianStateCode[]],
  { errorMap: () => ({ message: taxClientMessages.INVALID_STATE }) },
)
const optionalStateCode = z
  .literal('')
  .transform(() => null)
  .or(stateEnum)
  .nullish()

// Australian postcode — exactly 4 digits, or null. Empty string → null.
const optionalPostcode = z
  .string()
  .trim()
  .regex(/^\d{4}$/, taxClientMessages.INVALID_POSTCODE)
  .nullish()
  .or(z.literal('').transform(() => null))

// Contact email — a valid address, or null. Empty string → null. Trimmed and
// lower-cased so storage/lookups/display stay consistent.
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .email(taxClientMessages.INVALID_EMAIL)
  .nullish()
  .or(z.literal('').transform(() => null))

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
  address_line: optionalText(255),
  locality: optionalText(120),
  state_code: optionalStateCode,
  postcode: optionalPostcode,
  email: optionalEmail,
  bank_account_name: optionalText(200),
  bank_account_prefix: optionalText(6),
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
  address_line: optionalText(255),
  locality: optionalText(120),
  state_code: optionalStateCode,
  postcode: optionalPostcode,
  email: optionalEmail,
  bank_account_name: optionalText(200),
  bank_account_prefix: optionalText(6),
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

// ── CSV export / import ──

// Query params for the CSV export: the SAME filters the list accepts, minus
// pagination and sort (the export is always every matching row, sorted by name).
// Client group and status still filter the export even though neither is a
// column in the file.
export const exportTaxClientsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  entity_type_id: csvOf(z.string().trim().min(1)),
  client_group_id: csvOf(z.string().trim().min(1)),
  software_id: csvOf(z.string().trim().min(1)),
  firm_id: csvOf(z.string().trim().min(1)),
  // csvOf already treats '' as "no filter", so ?status= exports everything rather
  // than failing validation - the behaviour the old .literal('') branch provided.
  status: csvOf(statusEnum),
})

// The final gate on a validated CSV row, applied AFTER the CSV service's own
// field checks have produced friendly per-column messages. It reuses the exact
// field validators the Add client form goes through, so an import can never be
// looser than the form - if the two ever drift, this fails loudly rather than
// writing something the form would have rejected. Client group, assignee and
// status are absent because the file cannot carry them.
export const csvImportClientSchema = createTaxClientSchema.pick({
  firm_id: true,
  name: true,
  is_company: true,
  gender: true,
  title: true,
  dob_or_incorporation_date: true,
  abn: true,
  acn: true,
  trading_name: true,
  address_line: true,
  locality: true,
  state_code: true,
  postcode: true,
  email: true,
  bank_account_name: true,
  bank_account_prefix: true,
  bank_account_number: true,
  director_id: true,
  software_id: true,
}).extend({
  // Required in the CSV even though the column is nullable in the database: the
  // Add client form requires it, and the Annual Review feature depends on it.
  entity_type_id: z.string().trim().min(1, taxClientMessages.ENTITY_TYPE_NOT_FOUND),
})

// Query params for the server-driven list. Values arrive as strings.
export const listTaxClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  // Multi-value filters: "id1,id2". A single value is a one-member list, so URLs
  // bookmarked before multi-select still work. undefined = no filter = "all".
  entity_type_id: csvOf(z.string().trim().min(1)),
  client_group_id: csvOf(z.string().trim().min(1)),
  software_id: csvOf(z.string().trim().min(1)),
  firm_id: csvOf(z.string().trim().min(1)),
  status: csvOf(statusEnum),
  sort_by: z.enum(['name', 'created_at']).default('name'),
  sort_dir: z.enum(['asc', 'desc']).default('asc'),
})
