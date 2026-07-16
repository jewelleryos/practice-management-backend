// Mortgage service-task statuses — a FIXED set, hardcoded here (the app is the source
// of truth; the mortgage_tasks.status CHECK mirrors these). Distinct from the tax
// task-status set. Order is the intended pipeline order.
export const MORTGAGE_TASK_STATUS_VALUES = [
  'not_started',
  'ask_for_document',
  'in_process',
  'ready_for_disbursement',
  'completed',
] as const

export type MortgageTaskStatus = (typeof MORTGAGE_TASK_STATUS_VALUES)[number]

export const DEFAULT_MORTGAGE_TASK_STATUS: MortgageTaskStatus = 'not_started'

// A description is mandatory when moving to any status except Not Started. Any
// transition is allowed (no ordering rule); only the description requirement applies.
export function mortgageStatusNeedsDescription(status: MortgageTaskStatus): boolean {
  return status !== 'not_started'
}

// Runtime guard.
export function isMortgageTaskStatus(value: unknown): value is MortgageTaskStatus {
  return (
    typeof value === 'string' &&
    (MORTGAGE_TASK_STATUS_VALUES as readonly string[]).includes(value)
  )
}
