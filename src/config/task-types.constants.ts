// Task types — the FIXED discriminator on a tax task. A 'service' task is
// generated from a service + frequency + period (every existing task); a
// 'general' task is ad-hoc: a plain title, no service/frequency/period. The
// tax_tasks table pins its `task_type` column to these values with a CHECK
// constraint, and the service layer branches on it.

export const TASK_TYPE_VALUES = ['service', 'general'] as const

export type TaskType = (typeof TASK_TYPE_VALUES)[number]

// The type a task has unless it is explicitly created as a general task.
export const DEFAULT_TASK_TYPE: TaskType = 'service'

// Runtime guard — true if the given value is a valid task type.
export function isTaskType(value: unknown): value is TaskType {
  return typeof value === 'string' && (TASK_TYPE_VALUES as readonly string[]).includes(value)
}
