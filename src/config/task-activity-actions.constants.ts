// Task activity actions — the FIXED vocabulary of event codes written to the
// tax_task_activity audit log. The DB column `action` is free TEXT with NO CHECK
// (audit vocabularies grow over time and shouldn't need a migration each time);
// the app is the source of truth, and every write goes through the service using
// one of these codes.
//
// `detail` (JSONB on the row) carries per-event context, e.g.
//   STATUS_CHANGED         -> { from, to }         (status codes)
//   WORK_STATUS_CHANGED    -> { from, to, from_name, to_name }  (ids + display names)
//   PRIORITY_CHANGED       -> { from, to }         (priority codes)
//   DUE_DATE_CHANGED       -> { from, to }         (ISO strings or null)
//   DESCRIPTION_CHANGED    -> { from, to }         (old + new text; stored, not shown in UI)
//   PERIOD_DATES_CHANGED   -> { bound, from, to }  (bound = 'start' | 'end'; dates or null)
//   PREPARER_CHANGED       -> { from, to, from_name, to_name }  (member ids + names, or null)
//   REVIEWER_CHANGED       -> { from, to, from_name, to_name }  (member ids + names, or null)
//   CHECKLIST_ITEM_CHECKED -> { item_id, heading }
//   COMMENT_ADDED          -> { comment_id }

export const TASK_ACTIVITY_ACTIONS = {
  TASK_CREATED: 'task_created',
  STATUS_CHANGED: 'status_changed',
  WORK_STATUS_CHANGED: 'work_status_changed',
  PRIORITY_CHANGED: 'priority_changed',
  DUE_DATE_CHANGED: 'due_date_changed',
  DESCRIPTION_CHANGED: 'description_changed',
  PERIOD_DATES_CHANGED: 'period_dates_changed',
  PREPARER_CHANGED: 'preparer_changed',
  REVIEWER_CHANGED: 'reviewer_changed',
  CHECKLIST_ITEM_ADDED: 'checklist_item_added',
  CHECKLIST_ITEM_REMOVED: 'checklist_item_removed',
  CHECKLIST_ITEM_CHECKED: 'checklist_item_checked',
  CHECKLIST_ITEM_UNCHECKED: 'checklist_item_unchecked',
  COMMENT_ADDED: 'comment_added',
  COMMENT_EDITED: 'comment_edited',
  COMMENT_DELETED: 'comment_deleted',
} as const

export type TaskActivityAction =
  (typeof TASK_ACTIVITY_ACTIONS)[keyof typeof TASK_ACTIVITY_ACTIONS]

// All valid action codes (for guards / iteration).
export const TASK_ACTIVITY_ACTION_VALUES: readonly TaskActivityAction[] =
  Object.values(TASK_ACTIVITY_ACTIONS)

// Runtime guard — true if the given value is a known activity action.
export function isTaskActivityAction(value: unknown): value is TaskActivityAction {
  return (
    typeof value === 'string' &&
    (TASK_ACTIVITY_ACTION_VALUES as readonly string[]).includes(value)
  )
}
