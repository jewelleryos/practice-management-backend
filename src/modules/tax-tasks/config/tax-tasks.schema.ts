import { z } from 'zod'
import { taxTaskMessages } from './tax-tasks.messages'
import {
  SERVICE_FREQUENCY_VALUES,
  type ServiceFrequency,
} from '../../../config/service-frequencies.constants'
import {
  TASK_PRIORITY_VALUES,
  type TaskPriority,
} from '../../../config/task-priorities.constants'
import {
  TASK_STATUS_VALUES,
  type TaskStatus,
} from '../../../config/task-statuses.constants'

// Optional free-text: trims, treats '' as null, allows omitted/null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

const frequencyEnum = z.enum(
  SERVICE_FREQUENCY_VALUES as unknown as [ServiceFrequency, ...ServiceFrequency[]],
  { errorMap: () => ({ message: taxTaskMessages.INVALID_FREQUENCY }) },
)

const priorityEnum = z.enum(
  TASK_PRIORITY_VALUES as unknown as [TaskPriority, ...TaskPriority[]],
  { errorMap: () => ({ message: taxTaskMessages.INVALID_PRIORITY }) },
)

const statusEnum = z.enum(
  TASK_STATUS_VALUES as unknown as [TaskStatus, ...TaskStatus[]],
)

// Optional ISO date/time (UTC instant) or null. The frontend sends the due date
// as an ISO string; the DB column is TIMESTAMPTZ. '' is treated as null.
const optionalDueDate = z
  .string()
  .trim()
  .datetime({ offset: true, message: taxTaskMessages.DUE_DATE_INVALID })
  .nullish()
  .or(z.literal('').transform(() => null))

// Sub-period fields. Accepted loosely here (non-negative small ints); the exact
// "which are required / must be 0" rule depends on `frequency` and is enforced in
// the service layer (resolvePeriod), where a clear per-frequency message is thrown.
const period = z.coerce.number().int().min(0).max(53).optional()

// Informational period date (YYYY-MM-DD) or null. '' → null. The "only for
// weekly / fortnightly" rule is enforced in the service.
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .nullish()
  .or(z.literal('').transform(() => null))

// Extra, task-specific checklist items added in the create form (on top of the
// items copied from the service's master checklist).
const additionalChecklistItem = z.object({
  heading: z.string().trim().min(1, taxTaskMessages.CHECKLIST_HEADING_REQUIRED).max(200),
  description: optionalText(1000),
  is_required: z.boolean().default(false),
})

export const createTaxTaskSchema = z.object({
  client_id: z.string().min(1, taxTaskMessages.CLIENT_REQUIRED),
  service_id: z.string().min(1, taxTaskMessages.SERVICE_REQUIRED),
  financial_year_id: z.string().min(1, taxTaskMessages.FINANCIAL_YEAR_REQUIRED),
  frequency: frequencyEnum,

  // Title. Only a ONE-TIME service task carries one (its own required name — it has
  // no recurring period to label it by); recurring tasks are labelled by their
  // service and ignore this. The "required for one_time / null otherwise" rule is
  // enforced in the service layer, where frequency is known.
  title: optionalText(200),

  // Sub-period (validated against frequency in the service).
  quarter: period,
  month: period,
  fortnight_half: period,
  week: period,

  // Informational period date range (only for weekly / fortnightly; enforced
  // in the service).
  period_start_date: optionalDate,
  period_end_date: optionalDate,

  description: optionalText(2000),
  priority: priorityEnum.default('medium'),
  due_date: optionalDueDate,
  preparer_id: z.string().trim().min(1).nullish(),
  reviewer_id: z.string().trim().min(1).nullish(),
  // Work status to start at; omitted → the master's current default.
  work_status_id: z.string().trim().min(1).nullish(),

  // Extra checklist items to append to the service's snapshotted items.
  additional_checklist_items: z.array(additionalChecklistItem).max(50).default([]),
})

// Create a GENERAL (ad-hoc) task: no service / frequency / period. It still
// belongs to a client + financial year, carries a title, and can have a
// user-defined checklist. The assignee reuses `preparer_id`; there is no reviewer.
export const createGeneralTaskSchema = z.object({
  client_id: z.string().min(1, taxTaskMessages.CLIENT_REQUIRED),
  financial_year_id: z.string().min(1, taxTaskMessages.FINANCIAL_YEAR_REQUIRED),
  title: z.string().trim().min(1, taxTaskMessages.TITLE_REQUIRED).max(200),
  description: optionalText(2000),
  status: statusEnum.default('not_started'),
  priority: priorityEnum.default('medium'),
  due_date: optionalDueDate,
  // The assignee (stored in preparer_id). Optional/nullable = unassigned.
  preparer_id: z.string().trim().min(1).nullish(),
  // The whole checklist is user-defined (no service to copy from).
  checklist_items: z.array(additionalChecklistItem).max(50).default([]),
})

// Change a task's lifecycle status.
export const updateTaxTaskStatusSchema = z.object({
  status: statusEnum,
})

// Reassign preparer and/or reviewer. Omit a field to leave it unchanged; send
// null to unassign; send a member id to set it. The service validates the member.
export const reassignTaxTaskSchema = z.object({
  preparer_id: z.string().trim().min(1).nullish(),
  reviewer_id: z.string().trim().min(1).nullish(),
})

// Tick / untick a checklist item (item id comes from the URL).
export const toggleChecklistItemSchema = z.object({
  is_done: z.boolean(),
})

// ── Single-field edit: PATCH /:id/:field ──
// One route edits any of these "plain" fields. The field name is the URL segment
// (kebab-case); the body carries the new value. Field-specific validation (enum,
// date shape, work-status existence, period rules) runs in the service so each can
// throw its own clear message. `value` is always a string or null:
//   priority       → a task-priority code
//   work-status    → a work-status id, or null to clear
//   description    → free text, or null/'' to clear
//   due-date       → an ISO datetime, or null to clear
//   period-start   → a YYYY-MM-DD date, or null to clear
//   period-end     → a YYYY-MM-DD date, or null to clear
export const TASK_EDITABLE_FIELDS = [
  'priority',
  'work-status',
  'description',
  'due-date',
  'period-start',
  'period-end',
] as const
export type TaskEditableField = (typeof TASK_EDITABLE_FIELDS)[number]

export const taskFieldParamSchema = z.enum(TASK_EDITABLE_FIELDS, {
  errorMap: () => ({ message: taxTaskMessages.UNKNOWN_FIELD }),
})

export const updateTaskFieldSchema = z.object({
  value: z.string().nullable(),
})

// Add a comment. `parent_id` present = a reply (the service checks it's a live
// top-level comment on the same task); omitted/null = a new top-level comment.
export const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1, taxTaskMessages.COMMENT_BODY_REQUIRED).max(5000),
  parent_id: z.string().trim().min(1).nullish(),
})

// Edit a comment's text (author only).
export const updateTaskCommentSchema = z.object({
  body: z.string().trim().min(1, taxTaskMessages.COMMENT_BODY_REQUIRED).max(5000),
})

// Query params for the server-driven list. Values arrive as strings.
export const listTaxTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  client_id: z.string().trim().min(1).optional(),
  service_id: z.string().trim().min(1).optional(),
  financial_year_id: z.string().trim().min(1).optional(),
  // Narrow to service (recurring) or general (ad-hoc) tasks.
  task_type: z.enum(['service', 'general']).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  frequency: frequencyEnum.optional(),
  // Filter by preparer. VIEW_ALL only — a VIEW_ASSIGNED member is already scoped
  // to their own tasks, so the service ignores this for them (see ALL_TASKS_PAGE_RULES.md).
  preparer_id: z.string().trim().min(1).optional(),
  // Filter by reviewer. VIEW_ALL only, same as preparer_id.
  reviewer_id: z.string().trim().min(1).optional(),
  // Free-text search over task title + client name. '' → omitted.
  search: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  sort_by: z.enum(['created_at', 'due_date']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
})

// Work Status grid query. financial_year_id / month are required only for some
// frequencies; the service enforces that (and validates the service supports the
// frequency). A `month` (1-12, FY numbering) scopes fortnightly / weekly.
export const workStatusGridQuerySchema = z.object({
  service_id: z.string().trim().min(1),
  frequency: frequencyEnum,
  financial_year_id: z.string().trim().min(1).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
})
