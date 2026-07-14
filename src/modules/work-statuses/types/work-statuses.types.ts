// A work status — practice-wide master data for tracking a task's progress
// (e.g. 'Not Started', 'In Progress', 'Completed'). `color` is a #RRGGBB hex used
// to render the status chip; `is_active` retires a status without deleting it.
export interface WorkStatus {
  id: string
  name: string
  color: string
  is_active: boolean
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateWorkStatusRequest {
  name: string
  color: string
  is_active?: boolean
  is_default?: boolean
}

export interface UpdateWorkStatusRequest {
  name?: string
  color?: string
  is_active?: boolean
  is_default?: boolean
}

export interface WorkStatusListResponse {
  items: WorkStatus[]
}
