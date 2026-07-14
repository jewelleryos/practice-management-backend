import { z } from 'zod'
import { personalTaskMessages } from './tax-personal-tasks.messages'
import { TASK_STATUS_VALUES, type TaskStatus } from '../../../config/task-statuses.constants'

// Optional free-text: trims, treats '' as null, allows omitted/null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

const statusEnum = z.enum(TASK_STATUS_VALUES as unknown as [TaskStatus, ...TaskStatus[]], {
  errorMap: () => ({ message: personalTaskMessages.INVALID_STATUS }),
})

// Optional ISO date/time (UTC instant) or null. '' → null. DB column is TIMESTAMPTZ.
const optionalDueDate = z
  .string()
  .trim()
  .datetime({ offset: true, message: personalTaskMessages.DUE_DATE_INVALID })
  .nullish()
  .or(z.literal('').transform(() => null))

// A list of member ids (followers). Deduped in the service; the creator is
// filtered out there (they see the task via created_by, never as a follower).
const followerIds = z.array(z.string().trim().min(1)).max(50).default([])

// ── Create ──
export const createPersonalTaskSchema = z.object({
  title: z.string().trim().min(1, personalTaskMessages.TITLE_REQUIRED).max(200),
  description: optionalText(2000),
  status: statusEnum.default('not_started'),
  due_date: optionalDueDate,
  follower_ids: followerIds,
})

// ── Edit any field (partial) ──
// Both the creator and any follower can edit anything. Every field is optional;
// only the sent ones change.
export const updatePersonalTaskSchema = z
  .object({
    title: z.string().trim().min(1, personalTaskMessages.TITLE_REQUIRED).max(200).optional(),
    description: optionalText(2000),
    status: statusEnum.optional(),
    due_date: optionalDueDate,
  })
  .refine((d) => Object.keys(d).length > 0, { message: personalTaskMessages.UPDATED })

// ── Status only (board drag) ──
export const updatePersonalTaskStatusSchema = z.object({
  status: statusEnum,
})

// ── Replace the follower set ──
export const setFollowersSchema = z.object({
  follower_ids: followerIds,
})

// ── Notes ──
export const createNoteSchema = z.object({
  body: z.string().trim().min(1, personalTaskMessages.NOTE_BODY_REQUIRED).max(5000),
})

export const updateNoteSchema = z.object({
  body: z.string().trim().min(1, personalTaskMessages.NOTE_BODY_REQUIRED).max(5000),
})

// ── List query (server-driven: scoped, filtered, sorted, paginated) ──
export const listPersonalTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  // Narrow to tasks a specific member follows.
  follower_id: z.string().trim().min(1).optional(),
  // Free-text over the title. '' → omitted.
  search: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  sort_by: z.enum(['created_at', 'due_date']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
})
