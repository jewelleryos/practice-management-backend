import type { MortgageTaskStatus } from '../../../config/mortgage-task-statuses.constants'

// ── Requests ──

export interface CreateMortgageTaskRequest {
  firm_id: string
  loan_type_id: string
  client_name: string
  financial_institution?: string | null
  summary?: string | null
  follower_ids: string[]
  note?: string | null // optional first plain note
}

export interface UpdateMortgageTaskRequest {
  // firm_id is immutable after create; status changes go through changeStatus.
  loan_type_id?: string
  client_name?: string
  financial_institution?: string | null
  summary?: string | null
}

export interface ChangeMortgageTaskStatusRequest {
  status: MortgageTaskStatus
  description?: string | null
}

export interface SetMortgageTaskFollowersRequest {
  follower_ids: string[]
}

export interface CreateMortgageTaskNoteRequest {
  body: string
}

export interface UpdateMortgageTaskNoteRequest {
  body: string
}

// Add a comment. `parent_id` set = a one-level reply; omitted/null = top-level.
export interface CreateMortgageTaskCommentRequest {
  body: string
  parent_id?: string | null
}

export interface UpdateMortgageTaskCommentRequest {
  body: string
}

export interface ListMortgageTasksQuery {
  page: number
  pageSize: number
  firm_id?: string
  status?: MortgageTaskStatus
  loan_type_id?: string
  follower_id?: string
  search?: string
  sort_by: 'created_at'
  sort_dir: 'asc' | 'desc'
}

// ── Responses ──

export interface MortgageTaskFollower {
  member_id: string
  name: string | null
}

export interface MortgageTaskMemberOption {
  id: string
  name: string
}

// A note: a plain note (kind='note') or an immutable status-change note
// (kind='status_change', with from_status/to_status set and body = the description).
export interface MortgageTaskNote {
  id: string
  kind: 'note' | 'status_change'
  body: string | null
  from_status: MortgageTaskStatus | null
  to_status: MortgageTaskStatus | null
  created_by: string | null
  created_by_name: string | null
  edited: boolean
  created_at: string
  updated_at: string
}

export interface MortgageTaskActivity {
  id: string
  action: string
  detail: Record<string, any>
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

// One comment as returned to the UI. `body` is null for a soft-deleted tombstone
// kept only because it still has live replies. Top-level comments carry `replies`;
// a reply's `replies` is always empty (one level of threading).
export interface MortgageTaskCommentView {
  id: string
  parent_id: string | null
  author_id: string | null
  author_name: string | null
  body: string | null
  edited: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  replies: MortgageTaskCommentView[]
}

export interface MortgageTaskCommentListResponse {
  items: MortgageTaskCommentView[]
}

export interface MortgageTaskListItem {
  id: string
  firm_id: string
  firm_name: string | null
  loan_type_id: string
  loan_type_name: string | null
  client_name: string
  financial_institution: string | null
  summary: string | null
  status: MortgageTaskStatus
  created_by: string
  creator_name: string | null
  followers: MortgageTaskFollower[]
  note_count: number
  created_at: string
  updated_at: string
}

export interface MortgageTaskListResponse {
  items: MortgageTaskListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface MortgageTaskDetail extends MortgageTaskListItem {
  notes: MortgageTaskNote[]
}

export interface MortgageTaskActivityListResponse {
  items: MortgageTaskActivity[]
}
