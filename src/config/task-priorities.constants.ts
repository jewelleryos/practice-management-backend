// Task priorities — the FIXED urgency scale a task can carry. Like task statuses
// and service frequencies, this set is hardcoded: the backend depends on it and
// the tax_tasks table pins its `priority` column to these values with a CHECK.
// Not stored in a table; referenced wherever a task priority is needed.

export const TASK_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'] as const

export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number]

const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

// Display list (code + human label), in ascending urgency — the frontend renders
// the priority picker from this.
export const TASK_PRIORITY_LIST: { code: TaskPriority; label: string }[] =
  TASK_PRIORITY_VALUES.map((code) => ({ code, label: TASK_PRIORITY_LABELS[code] }))

export const ALL_TASK_PRIORITIES: readonly TaskPriority[] = TASK_PRIORITY_VALUES

// The priority a new task starts at.
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium'

// Runtime guard — true if the given value is a valid task priority.
export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && (TASK_PRIORITY_VALUES as readonly string[]).includes(value)
}
