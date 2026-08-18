import type { z } from 'zod'
import type { AnnualReviewStatus } from '../../../config/annual-review-statuses.constants'
import type {
  listAnnualReviewsSchema,
  updateAnnualReviewSchema,
} from '../config/annual-reviews.schema'

export type ListAnnualReviewsQuery = z.infer<typeof listAnnualReviewsSchema>
export type UpdateAnnualReviewRequest = z.infer<typeof updateAnnualReviewSchema>

// One row on the page. Everything except `status` and `notes` is joined in from the
// client and is read-only in the UI.
export interface AnnualReviewListItem {
  id: string
  client_id: string
  client_name: string
  entity_type_name: string | null
  // Calendar dates, returned verbatim as 'YYYY-MM-DD' (see the DATE type parser in
  // lib/db.ts). The frontend must format these from their text parts, never via
  // new Date(), or the day can shift by one.
  incorporation_date: string | null
  year: number
  review_date: string
  status: AnnualReviewStatus
  notes: string | null
}

// A client that WOULD be eligible but has no incorporation date on file, so no row
// can be generated for them. Surfaced on the page so nobody is silently skipped.
export interface MissingDateClient {
  id: string
  name: string
  entity_type_name: string | null
}

export interface AnnualReviewListResponse {
  items: AnnualReviewListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  // The year actually used, echoed back so the UI can show it without guessing.
  year: number
  // Every year that has rows, newest first — drives the year filter.
  years: number[]
  statusCounts: Record<AnnualReviewStatus, number>
  // Reviews in this year past their date and not done. Powers the warning strip.
  overdueCount: number
  missingDateCount: number
}
