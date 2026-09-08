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
  address_line?: string | null
  locality?: string | null
  state_code?: string | null
  postcode?: string | null
  email?: string | null
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
  address_line?: string | null
  locality?: string | null
  state_code?: string | null
  postcode?: string | null
  email?: string | null
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
  // Multi-value filters, parsed from one comma-separated parameter by csvOf.
  // undefined (never an empty array) means "no filter".
  entity_type_id?: string[]
  client_group_id?: string[]
  software_id?: string[]
  firm_id?: string[]
  status?: ClientStatus[]
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
  // Whether this client has at least one engagement letter. The list shows a
  // "pending" dot when this is false.
  engagement_letter_exists: boolean
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
  address_line: string | null
  locality: string | null
  state: string | null
  state_code: string | null
  postcode: string | null
  email: string | null
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
  // Non-completed tasks for this client, scoped to what the viewer may see
  // (VIEW_ALL → all; VIEW_ASSIGNED only → tasks they prepare/review; neither → 0).
  pending_task_count: number
}

// ── CSV export / import ──
// The file is 23 columns; the wizard's whole Classification section (client
// group, assignee, status) is deliberately NOT in it, so an imported client is
// always created ungrouped, unassigned and Active and is classified in the app
// afterwards. See docs/superpowers/specs/2026-08-20-client-csv-import-export-design.md.

// Query params for the export - the same filters the list accepts, minus
// pagination and sort. Group / assignee / status still FILTER the export even
// though they are not columns in it.
export interface ExportTaxClientsQuery {
  search?: string
  // Multi-value, exactly as ListTaxClientsQuery above - the export must apply the
  // same filters as the list it was launched from.
  entity_type_id?: string[]
  client_group_id?: string[]
  software_id?: string[]
  firm_id?: string[]
  status?: ClientStatus[]
}

// One row as read out of the database for the export, already flattened to the
// names (not ids) the file carries. `dob_or_incorporation_date` is the raw
// 'YYYY-MM-DD' string (pg returns DATE verbatim - see lib/db.ts).
export interface ExportRow {
  firm_name: string | null
  entity_type_name: string | null
  software_name: string | null
  name: string
  is_company: boolean
  title: string | null
  gender: string | null
  dob_or_incorporation_date: string | null
  trading_name: string | null
  abn: string | null
  acn: string | null
  director_id: string | null
  address_line: string | null
  locality: string | null
  state_code: string | null
  postcode: string | null
  email: string | null
  bank_account_name: string | null
  bank_account_prefix: string | null
  bank_account_number: string | null
}

// A validated row, ready to insert. Shaped to what insertClientWithin needs;
// client_group_id / assignee_id / status are not here because the file cannot
// carry them (they are set to NULL / NULL / 'active' at insert time).
export interface ImportableClient {
  firm_id: string
  name: string
  is_company: boolean
  gender: string | null
  title: string | null
  entity_type_id: string
  software_id: string | null
  dob_or_incorporation_date: string | null
  abn: string | null
  acn: string | null
  trading_name: string | null
  address_line: string | null
  locality: string | null
  state_code: string | null
  postcode: string | null
  email: string | null
  bank_account_name: string | null
  bank_account_prefix: string | null
  bank_account_number: string | null
  director_id: string | null
}

// One row in the preview table the user reviews before committing.
export interface ImportPreviewRow {
  // 1-based DATA row: the header is not counted, so this is the line number the
  // user sees in Excel minus one. Shown in the preview table.
  row_number: number
  name: string
  firm: string
  entity_type: string
  errors: string[] // empty = this row is ok
}

export interface ImportPreview {
  // File-level problems (header, size, row count). When non-empty the row table
  // is not shown at all - there is nothing meaningful to show.
  file_errors: string[]
  rows: ImportPreviewRow[]
  total_rows: number
  error_rows: number
  // True only when there is nothing wrong anywhere. The Import button is enabled
  // on exactly this.
  can_import: boolean
}

export interface ImportResult {
  imported: number
  // The ULID stamped on every client this import created - the undo handle.
  batch_id: string
}

// Counts of what deleting a client would remove, for the confirm dialog. These are
// UNSCOPED by the caller's task-view permission on purpose: the dialog must state
// what the button will remove, not what this member happens to see.
export interface TaxClientDeletionImpact {
  tasks: number
  notes: number
  services: number
  relationships: number
  engagement_letters: number
  annual_reviews: number
}
