// Annual review statuses — the FIXED set a review moves through.
//
// Unlike Work Statuses (admin-editable master data) this list is hardcoded and
// enforced by a CHECK constraint on the annual_reviews table. The three steps are
// the firm's whole process: it is waiting, it has gone to the client, it is finished.
//
// There are deliberately NO transition rules — any status may move to any other.
// The firm's process is not rigid enough to justify enforcing an order, and getting
// that order wrong would block legitimate work.

export const ANNUAL_REVIEW_STATUSES = ['pending', 'sent_to_client', 'done'] as const

export type AnnualReviewStatus = (typeof ANNUAL_REVIEW_STATUSES)[number]

// The status every generated row starts in (matches the table's column default).
export const DEFAULT_ANNUAL_REVIEW_STATUS: AnnualReviewStatus = 'pending'

// Due-date windows the list can be filtered by. These are RELATIVE to today in the
// firm's timezone, computed in SQL - see annual-reviews.service.
//
//   overdue       - review date has passed and the review is not done yet
//   today         - due today
//   this_week     - Monday to Sunday of the current week
//   this_month    - the current calendar month
//   next_30_days  - today through 30 days ahead
//
// They compose with the year filter, so picking a past year plus "today" correctly
// returns nothing.
export const ANNUAL_REVIEW_DUE_FILTERS = [
  'overdue',
  'today',
  'this_week',
  'this_month',
  'next_30_days',
] as const

export type AnnualReviewDueFilter = (typeof ANNUAL_REVIEW_DUE_FILTERS)[number]
