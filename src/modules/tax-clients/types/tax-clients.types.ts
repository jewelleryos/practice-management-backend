import type { ServiceFrequency } from '../../../config/service-frequencies.constants'

export type ClientStatus = 'active' | 'inactive'

// ── Child inputs (as accepted nested in the create payload) ──

export interface RelationshipInput {
  relation_type_id: string
  related_client_id: string
}

export interface ServiceInput {
  service_id: string
  frequency: ServiceFrequency
  short_description?: string | null
  assignee_id?: string | null
}

export interface NoteInput {
  note_type_id: string
  text: string
}

// ── Child inputs as accepted on UPDATE ──
// Relationships and services carry an optional `id`: present = an existing row
// to keep (services are also updated in place); absent = a new row to insert.
// Existing rows whose id is not sent back are soft-deleted. Notes are
// append-only on update (existing notes are never touched), so they reuse
// NoteInput unchanged.
export type RelationshipEditInput = RelationshipInput & { id?: string }
export type ServiceEditInput = ServiceInput & { id?: string }

// ── Requests ──

// The frontend composes the single `name` (person → "first middle last",
// company → company name) and sends `is_company` to record which it was.
export interface CreateTaxClientRequest {
  firm_id: string
  name: string
  is_company: boolean
  gender?: string | null
  title?: string | null
  entity_type_id?: string | null
  dob_or_incorporation_date?: string | null
  abn?: string | null
  acn?: string | null
  trading_name?: string | null
  bank_account_name?: string | null
  bank_account_prefix?: string | null
  bank_account_number?: string | null
  director_id?: string | null
  client_group_id?: string | null
  software_id?: string | null
  assignee_id?: string | null
  status: ClientStatus
  relationships: RelationshipInput[]
  services: ServiceInput[]
  notes: NoteInput[]
}

// Core fields are all optional. Child collections are optional too: when a
// collection is provided it is reconciled against what's stored (relationships
// & services by id; notes are appended). Omitting a collection leaves it as-is.
export interface UpdateTaxClientRequest {
  firm_id?: string
  name?: string
  is_company?: boolean
  gender?: string | null
  title?: string | null
  entity_type_id?: string | null
  dob_or_incorporation_date?: string | null
  abn?: string | null
  acn?: string | null
  trading_name?: string | null
  bank_account_name?: string | null
  bank_account_prefix?: string | null
  bank_account_number?: string | null
  director_id?: string | null
  client_group_id?: string | null
  software_id?: string | null
  assignee_id?: string | null
  status?: ClientStatus
  // Desired outgoing relationships / services (reconciled by id). New notes to
  // append. Each is undefined when the caller doesn't manage that collection.
  relationships?: RelationshipEditInput[]
  services?: ServiceEditInput[]
  notes?: NoteInput[]
}

export interface ListTaxClientsQuery {
  page: number
  pageSize: number
  search?: string
  entity_type_id?: string
  client_group_id?: string
  software_id?: string
  firm_id?: string
  status?: ClientStatus
  sort_by: 'name' | 'created_at'
  sort_dir: 'asc' | 'desc'
}

// ── Responses ──

export interface TaxClientListItem {
  id: string
  name: string
  is_company: boolean
  status: ClientStatus
  firm_id: string
  firm_name: string | null
  entity_type_id: string | null
  entity_type_name: string | null
  client_group_id: string | null
  client_group_name: string | null
  software_id: string | null
  software_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  created_at: string
}

export interface TaxClientListResponse {
  items: TaxClientListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface RelationshipView {
  id: string
  relation_type_id: string
  relation_type_name: string
  other_client_id: string
  other_client_name: string
  direction: 'outgoing' | 'incoming'
}

export interface ServiceView {
  id: string
  service_id: string
  service_name: string
  service_code: string
  frequency: ServiceFrequency
  short_description: string | null
  assignee_id: string | null
  assignee_name: string | null
}

export interface NoteView {
  id: string
  note_type_id: string
  note_type_name: string
  is_sensitive: boolean
  text: string
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

export interface TaxClientDetail {
  id: string
  firm_id: string
  firm_name: string | null
  name: string
  is_company: boolean
  gender: string | null
  title: string | null
  entity_type_id: string | null
  entity_type_name: string | null
  dob_or_incorporation_date: string | null
  abn: string | null
  acn: string | null
  trading_name: string | null
  bank_account_name: string | null
  bank_account_prefix: string | null
  bank_account_number: string | null
  director_id: string | null
  client_group_id: string | null
  client_group_name: string | null
  software_id: string | null
  software_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  status: ClientStatus
  created_at: string
  updated_at: string
  relationships: RelationshipView[]
  services: ServiceView[]
  notes: NoteView[]
}
