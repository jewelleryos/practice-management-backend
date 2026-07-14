// Task statuses — the FIXED lifecycle a task moves through. Unlike Work Statuses
// (admin-editable master data), this set is hardcoded: the backend logic depends
// on it and the tasks table pins its `status` column to these values with a CHECK
// constraint. Not stored in a table; referenced wherever a task status is needed.
//
// NOTE: distinct from the `work_statuses` master. Work statuses are free-form,
// admin-managed progress labels; task statuses are this fixed code-level lifecycle.

export const TASK_STATUS_VALUES = ['not_started', 'in_process', 'in_review', 'completed'] as const

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number]

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_process: 'In Process',
  in_review: 'In Review',
  completed: 'Completed',
}

// Display list (code + human label), in lifecycle order — the frontend renders
// the status picker from this.
export const TASK_STATUS_LIST: { code: TaskStatus; label: string }[] = TASK_STATUS_VALUES.map(
  (code) => ({ code, label: TASK_STATUS_LABELS[code] }),
)

export const ALL_TASK_STATUSES: readonly TaskStatus[] = TASK_STATUS_VALUES

// The status a new task starts in.
export const DEFAULT_TASK_STATUS: TaskStatus = 'not_started'

// Runtime guard — true if the given value is a valid task status.
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUS_VALUES as readonly string[]).includes(value)
}
