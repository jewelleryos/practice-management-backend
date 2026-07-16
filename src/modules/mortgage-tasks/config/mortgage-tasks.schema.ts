import { z } from 'zod'
import { mortgageTaskMessages } from './mortgage-tasks.messages'
import {
  MORTGAGE_TASK_STATUS_VALUES,
  type MortgageTaskStatus,
} from '../../../config/mortgage-task-statuses.constants'

// Optional free-text: trims, treats '' as null, allows omitted/null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

const statusEnum = z.enum(
  MORTGAGE_TASK_STATUS_VALUES as unknown as [MortgageTaskStatus, ...MortgageTaskStatus[]],
  { errorMap: () => ({ message: mortgageTaskMessages.INVALID_STATUS }) },
)

// A list of member ids (followers). Deduped + firm-validated in the service; the
// creator is filtered out there.
const followerIds = z.array(z.string().trim().min(1)).max(50).default([])

// ── Create ──
export const createMortgageTaskSchema = z.object({
  firm_id: z.string().trim().min(1, mortgageTaskMessages.FIRM_REQUIRED),
  loan_type_id: z.string().trim().min(1, mortgageTaskMessages.LOAN_TYPE_REQUIRED),
  client_name: z.string().trim().min(1, mortgageTaskMessages.CLIENT_NAME_REQUIRED).max(200),
  financial_institution: optionalText(200),
  summary: optionalText(2000),
  follower_ids: followerIds,
  note: optionalText(5000),
})

// ── Edit core fields (partial) — no firm_id (immutable), no status (use changeStatus) ──
export const updateMortgageTaskSchema = z
  .object({
    loan_type_id: z.string().trim().min(1, mortgageTaskMessages.LOAN_TYPE_REQUIRED).optional(),
    client_name: z
      .string()
      .trim()
      .min(1, mortgageTaskMessages.CLIENT_NAME_REQUIRED)
      .max(200)
      .optional(),
    financial_institution: optionalText(200),
    summary: optionalText(2000),
  })
  .refine((d) => Object.keys(d).length > 0, { message: mortgageTaskMessages.UPDATED })

// ── Change status — description requirement is enforced in the service (needed for
// every target except not_started). ──
export const changeMortgageTaskStatusSchema = z.object({
  status: statusEnum,
  description: optionalText(2000),
})

// ── Replace the follower set ──
export const setMortgageTaskFollowersSchema = z.object({
  follower_ids: followerIds,
})

// ── Notes ──
export const createMortgageTaskNoteSchema = z.object({
  body: z.string().trim().min(1, mortgageTaskMessages.NOTE_BODY_REQUIRED).max(5000),
})

export const updateMortgageTaskNoteSchema = z.object({
  body: z.string().trim().min(1, mortgageTaskMessages.NOTE_BODY_REQUIRED).max(5000),
})

// ── Comments (threaded, one level of replies) ──
export const createMortgageTaskCommentSchema = z.object({
  body: z.string().trim().min(1, mortgageTaskMessages.COMMENT_BODY_REQUIRED).max(5000),
  parent_id: z.string().trim().min(1).nullish(),
})

export const updateMortgageTaskCommentSchema = z.object({
  body: z.string().trim().min(1, mortgageTaskMessages.COMMENT_BODY_REQUIRED).max(5000),
})

// ── List query (server-driven: firm-scoped, filtered, sorted, paginated) ──
export const listMortgageTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  firm_id: z.string().trim().min(1).optional(),
  status: statusEnum.optional(),
  loan_type_id: z.string().trim().min(1).optional(),
  follower_id: z.string().trim().min(1).optional(),
  search: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
})
