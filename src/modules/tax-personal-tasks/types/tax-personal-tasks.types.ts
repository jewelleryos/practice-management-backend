import type { TaskStatus } from '../../../config/task-statuses.constants'

// ── Requests ──

export interface CreatePersonalTaskRequest {
  title: string
  description?: string | null
  status: TaskStatus
  due_date?: string | null
  follower_ids: string[]
}

export interface UpdatePersonalTaskRequest {
  title?: string
  description?: string | null
  status?: TaskStatus
  due_date?: string | null
}

export interface SetFollowersRequest {
  follower_ids: string[]
}

export interface CreateNoteRequest {
  body: string
}

export interface UpdateNoteRequest {
  body: string
}

export interface ListPersonalTasksQuery {
  page: number
  pageSize: number
  status?: TaskStatus
  follower_id?: string
  search?: string
  sort_by: 'created_at' | 'due_date'
  sort_dir: 'asc' | 'desc'
}

// ── Responses ──

// A follower as shown to the UI (the member id + display name).
export interface PersonalTaskFollower {
  member_id: string
  name: string | null
}

// A member option for the follower picker (FOR route).
export interface PersonalTaskMemberOption {
  id: string
  name: string
}

// One running note on a personal task.
export interface PersonalTaskNote {
  id: string
  body: string
  created_by: string | null
  created_by_name: string | null
  edited: boolean // updated_at is later than created_at
  created_at: string
  updated_at: string
}

// A row in the list / board. Followers are embedded (small set); notes are not
// (only the count is carried — the full notes come with the detail).
export interface PersonalTaskListItem {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  due_date: string | null
  created_by: string
  creator_name: string | null
  followers: PersonalTaskFollower[]
  note_count: number
  created_at: string
  updated_at: string
}

export interface PersonalTaskListResponse {
  items: PersonalTaskListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// The full task, including its notes.
export interface PersonalTaskDetail extends PersonalTaskListItem {
  notes: PersonalTaskNote[]
}
