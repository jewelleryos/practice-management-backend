import { db } from './db'
import { annualReviewService } from '../modules/annual-reviews/services/annual-reviews.service'

// In-process scheduler.
//
// The backend deploys as a single container (see the Dockerfile), so a timer inside
// the API is the simplest thing that works: no extra service to run, and no deploy
// configuration that can silently go unset and leave the job never running. It also
// behaves identically on a developer's laptop, which an external scheduler would not.
//
// Every run takes a PostgreSQL advisory lock first, so if the deployment is ever
// scaled past one container only one instance sweeps. The lock is released in a
// finally.

const SWEEP_LOCK_KEY = 'annual_reviews_sweep'
const TICK_MS = 6 * 60 * 60 * 1000 // 6 hours
const STARTUP_DELAY_MS = 30 * 1000 // let the pool warm up first

// 0 = Sunday, in the firm's timezone — not UTC, and not the server's locale. Which
// day it is only agrees between Sydney and UTC for part of the day, so this has to
// be explicit.
async function isSundayInAustralia(): Promise<boolean> {
  const result = await db.query(
    `SELECT EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Australia/Sydney'))::INT AS dow`,
  )
  return result.rows[0].dow === 0
}

async function sweep(reason: string): Promise<void> {
  const lock = await db.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`, [
    SWEEP_LOCK_KEY,
  ])
  if (!lock.rows[0].acquired) {
    console.log(
      `[scheduler] annual-review sweep skipped (${reason}) - another instance holds the lock`,
    )
    return
  }
  try {
    const year = await annualReviewService.currentYear()
    const inserted = await annualReviewService.ensureAnnualReviews(year)
    console.log(`[scheduler] annual-review sweep (${reason}) year=${year} inserted=${inserted}`)
  } finally {
    await db.query(`SELECT pg_advisory_unlock(hashtext($1))`, [SWEEP_LOCK_KEY])
  }
}

// A failed sweep must NEVER take the API down, and must never bubble up to a user
// action. It is logged and swallowed; the page-load safety net in the service is the
// backstop that fills in anything a missed sweep left behind.
async function safeSweep(reason: string): Promise<void> {
  try {
    await sweep(reason)
  } catch (err) {
    console.error(`[scheduler] annual-review sweep (${reason}) failed`, err)
  }
}

export function startScheduler(): void {
  // Once at startup, to catch a restart that happened over a missed Sunday.
  setTimeout(() => void safeSweep('startup'), STARTUP_DELAY_MS)

  // Then every 6 hours, acting only on Sundays. Running more than once on a Sunday
  // is harmless because the sweep is idempotent.
  setInterval(() => {
    void (async () => {
      try {
        if (await isSundayInAustralia()) await safeSweep('weekly')
      } catch (err) {
        console.error('[scheduler] day-of-week check failed', err)
      }
    })()
  }, TICK_MS)

  console.log('[scheduler] started - annual-review sweep runs Sundays (Australia/Sydney)')
}
