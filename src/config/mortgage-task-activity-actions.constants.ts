// Mortgage task activity actions — the FIXED vocabulary of event codes written to the
// mortgage_task_activity audit log. The DB column `action` is free TEXT with NO CHECK
// (audit vocabularies grow over time); the app is the source of truth and every write
// goes through the service using one of these codes.
//
// `detail` (JSONB on the row) carries per-event context, e.g.
//   TASK_UPDATED     -> { fields: string[] }        (changed field names)
//   STATUS_CHANGED   -> { from, to }                (status codes)
//   FOLLOWER_ADDED   -> { member_id, name }
//   FOLLOWER_REMOVED -> { member_id, name }
//   NOTE_ADDED       -> { note_id }
//   NOTE_UPDATED     -> { note_id }
//   NOTE_DELETED     -> { note_id }
//   COMMENT_ADDED    -> { comment_id, parent_id }
//   COMMENT_EDITED   -> { comment_id }
//   COMMENT_DELETED  -> { comment_id }

export const MORTGAGE_TASK_ACTIVITY_ACTIONS = {
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  STATUS_CHANGED: 'status_changed',
  FOLLOWER_ADDED: 'follower_added',
  FOLLOWER_REMOVED: 'follower_removed',
  NOTE_ADDED: 'note_added',
  NOTE_UPDATED: 'note_updated',
  NOTE_DELETED: 'note_deleted',
  COMMENT_ADDED: 'comment_added',
  COMMENT_EDITED: 'comment_edited',
  COMMENT_DELETED: 'comment_deleted',
} as const

export type MortgageTaskActivityAction =
  (typeof MORTGAGE_TASK_ACTIVITY_ACTIONS)[keyof typeof MORTGAGE_TASK_ACTIVITY_ACTIONS]
