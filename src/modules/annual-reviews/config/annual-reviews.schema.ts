import { z } from 'zod'
import {
  ANNUAL_REVIEW_STATUSES,
  ANNUAL_REVIEW_DUE_FILTERS,
} from '../../../config/annual-review-statuses.constants'
import { annualReviewMessages } from './annual-reviews.messages'

// List query. Every filter is optional. `year` is deliberately NOT defaulted here —
// the default is the current Australian calendar year, which needs a database round
// trip to determine, so the service fills it in.
export const listAnnualReviewsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(ANNUAL_REVIEW_STATUSES).optional(),
  // Due-date window, relative to today in the firm's timezone.
  due: z.enum(ANNUAL_REVIEW_DUE_FILTERS).optional(),
  search: z.string().trim().max(200).optional(),
  firmId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

// Update body. ONLY status and notes are accepted — every other field on a row is
// derived from the client and must never be settable by a member. The refine stops
// an empty body silently doing nothing.
export const updateAnnualReviewSchema = z
  .object({
    status: z.enum(ANNUAL_REVIEW_STATUSES).optional(),
    notes: z
      .string()
      .trim()
      .max(5000)
      .transform((v) => (v === '' ? null : v))
      .nullish(),
  })
  .refine((d) => d.status !== undefined || d.notes !== undefined, {
    message: annualReviewMessages.NOTHING_TO_UPDATE,
  })
