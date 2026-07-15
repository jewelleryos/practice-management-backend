import type { ServiceFrequency } from '../../../config/service-frequencies.constants'
import type { TaskPriority } from '../../../config/task-priorities.constants'
import type { TaskStatus } from '../../../config/task-statuses.constants'
import type { TaskType } from '../../../config/task-types.constants'

// ── Embedded checklist element (stored in tax_tasks.checklist JSONB) ──
// Snapshotted from the service's ACTIVE checklist items at task creation, then
// independent of the master. `id` is a per-item ULID; `done_by` is a member id
// and `done_at` a UTC instant, both set when the item is ticked.
export interface TaskChecklistItem {
  id: string
  heading: string
  description: string | null
  is_required: boolean
  is_done: boolean
  done_by: string | null
  done_at: string | null
}

// ── Requests ──

// An extra checklist item supplied on create (appended to the service snapshot).
export interface AdditionalChecklistItemInput {
  heading: string
  description?: string | null
  is_required?: boolean
}

export interface CreateTaxTaskRequest {
  client_id: string
  service_id: string
  financial_year_id: string
  frequency: ServiceFrequency
  // Only a one-time service task carries a title (required); null/omitted otherwise.
  title?: string | null
  quarter?: number
  month?: number
  fortnight_half?: number
  week?: number
  // Informational period date range (YYYY-MM-DD). Only for weekly / fortnightly.
  period_start_date?: string | null
  period_end_date?: string | null
  description?: string | null
  priority: TaskPriority
  due_date?: string | null
  preparer_id?: string | null
  reviewer_id?: string | null
  // The work status to start the task at. Omitted → the master's current default.
  work_status_id?: string | null
  additional_checklist_items?: AdditionalChecklistItemInput[]
}

// Create a GENERAL (ad-hoc) task — no service / frequency / period. `preparer_id`
// is the assignee; there is no reviewer. The checklist is entirely user-defined.
export interface CreateGeneralTaskRequest {
  client_id: string
  financial_year_id: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date?: string | null
  preparer_id?: string | null
  checklist_items?: AdditionalChecklistItemInput[]
}

// Change a task's lifecycle status.
export interface UpdateTaxTaskStatusRequest {
  status: TaskStatus
}

// Reassign preparer and/or reviewer. A field left `undefined` is untouched;
// `null` unassigns; a member id sets it. (At least one is expected in practice.)
export interface ReassignTaxTaskRequest {
  preparer_id?: string | null
  reviewer_id?: string | null
}

// Tick / untick a single checklist item (the item id comes from the URL).
export interface ToggleChecklistItemRequest {
  is_done: boolean
}

// ── Comments ──

// Add a comment. `parent_id` set = a reply to that top-level comment (one level
// only, enforced in the service); omitted/null = a new top-level comment.
export interface CreateTaskCommentRequest {
  body: string
  parent_id?: string | null
}

// Edit a comment's text (author only). The old text is retained in `versions`.
export interface UpdateTaskCommentRequest {
  body: string
}

// One comment as returned to the UI. `body` is null for a soft-deleted comment
// kept only as a tombstone (a deleted parent that still has live replies); the
// stored version history is never surfaced here. Top-level comments carry their
// `replies`; a reply's `replies` is always empty (one level of threading).
export interface TaskCommentView {
  id: string
  parent_id: string | null
  author_id: string | null
  author_name: string | null
  body: string | null
  edited: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  replies: TaskCommentView[]
}

export interface TaskCommentListResponse {
  items: TaskCommentView[]
}

// ── Activity ──

// One activity-log entry. `detail` is the per-event JSON context (shapes vary by
// action; see task-activity-actions.constants.ts). Ids in `detail` are raw member
// ids — the UI resolves names as needed.
export interface TaskActivityView {
  id: string
  action: string
  detail: Record<string, unknown>
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

export interface TaskActivityListResponse {
  items: TaskActivityView[]
}

export interface ListTaxTasksQuery {
  page: number
  pageSize: number
  client_id?: string
  service_id?: string
  financial_year_id?: string
  task_type?: TaskType
  status?: TaskStatus
  priority?: TaskPriority
  frequency?: ServiceFrequency
  preparer_id?: string
  reviewer_id?: string
  search?: string
  sort_by: 'created_at' | 'due_date'
  sort_dir: 'asc' | 'desc'
}

// ── Responses ──

// The resolved period columns (0 = not applicable at this frequency).
export interface TaskPeriod {
  quarter: number
  month: number
  fortnight_half: number
  week: number
}

// Distinct filter values available within the caller's visible tasks, for the
// global Tasks page dropdowns (status/priority/type/frequency are fixed enums).
export interface TaxTaskFilterOptions {
  services: { id: string; name: string }[]
  preparers: { id: string; name: string }[]
  reviewers: { id: string; name: string }[]
  financialYears: { id: string; name: string }[]
}

// ── Work Status grid (service-wise status per client across periods) ──
// Pickers for the Work Status page: tax-practice services (with their allowed
// frequencies) + financial years.
export interface WorkStatusOptionsResponse {
  services: { id: string; name: string; frequencies: ServiceFrequency[] }[]
  financialYears: { id: string; name: string }[]
}

// One SERVICE task in the grid scope, with just what a cell needs. The frontend
// pivots these into client (row) × period (column) cells.
export interface WorkStatusGridTask {
  id: string
  client_id: string
  financial_year_id: string
  financial_year: string | null
  quarter: number
  month: number
  fortnight_half: number
  week: number
  period_start_date: string | null
  period_end_date: string | null
  title: string | null
  status: TaskStatus
  work_status_id: string | null
  work_status_name: string | null
  work_status_color: string | null
  created_at: string
}

// The grid payload: rows are clients using the service at the selected frequency;
// a client with no task for a given period shows a dash.
export interface WorkStatusGridResponse {
  clients: { id: string; name: string }[]
  tasks: WorkStatusGridTask[]
}

export interface WorkStatusGridQuery {
  service_id: string
  frequency: ServiceFrequency
  financial_year_id?: string
  month?: number
}

export interface TaxTaskListItem extends TaskPeriod {
  id: string
  task_type: TaskType
  title: string | null
  client_id: string
  client_name: string | null
  service_id: string | null
  service_name: string | null
  service_code: string | null
  financial_year_id: string
  financial_year: string | null
  frequency: ServiceFrequency | null
  period_start_date: string | null
  period_end_date: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  work_status_id: string | null
  work_status_name: string | null
  work_status_color: string | null
  preparer_id: string | null
  preparer_name: string | null
  reviewer_id: string | null
  reviewer_name: string | null
  created_at: string
}

export interface TaxTaskListResponse {
  items: TaxTaskListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Result of any task WRITE (create / status / reassign / checklist). The caller
// gets the full detail ONLY when allowed to view the task afterwards (VIEW_ALL,
// or VIEW_ASSIGNED as its preparer/reviewer); otherwise just the id — so a write
// never leaks task data to someone without read access.
export type TaxTaskWriteResult = TaxTaskDetail | { id: string }

// Create returns the same shape (kept as a named alias for the create route).
export type CreateTaxTaskResult = TaxTaskWriteResult

// Board work-status change returns just the task's new work-status fields — enough
// for the board to update the cell; the board also refetches the grid.
export interface BoardWorkStatusResult {
  id: string
  work_status_id: string | null
  work_status_name: string | null
  work_status_color: string | null
}

export interface TaxTaskDetail extends TaskPeriod {
  id: string
  task_type: TaskType
  title: string | null
  client_id: string
  client_name: string | null
  service_id: string | null
  service_name: string | null
  service_code: string | null
  financial_year_id: string
  financial_year: string | null
  frequency: ServiceFrequency | null
  period_start_date: string | null
  period_end_date: string | null
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  work_status_id: string | null
  work_status_name: string | null
  work_status_color: string | null
  checklist: TaskChecklistItem[]
  preparer_id: string | null
  preparer_name: string | null
  reviewer_id: string | null
  reviewer_name: string | null
  created_at: string
  updated_at: string
}
