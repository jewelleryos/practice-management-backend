import type { PoolClient } from 'pg'
import { db } from '../lib/db'
import { AppError } from './app-error'
import { HTTP_STATUS } from '../config/constants'

// Manual card order inside a Kanban board column, shared by the three task tables
// that render a board (see migration 053).
//
// Cards are inserted BETWEEN their neighbours rather than the column being
// renumbered from a list the client sends. That is not a preference - a board
// column is an independently paginated infinite list, so the client normally holds
// only the first page and cannot restate the order of rows it has never loaded.
// The new position is therefore always computed on the server from the two rows
// the card was dropped between.
//
// Positions are only ever compared WITHIN one status column.

const SPACING = 1000

// Two doubles closer than this cannot be split into a distinct midpoint, so the
// column is renumbered instead. Reaching it takes about 50 drops into the exact
// same gap.
const MIN_GAP = 0.000001

export interface BoardOrderTable {
  /** Table name. Interpolated into SQL, so it must come from the frozen list below. */
  table: string
  /**
   * The ORDER BY that decides a column's order the FIRST time it is arranged -
   * i.e. the order the board already shows today. Columns only, no direction
   * placeholders.
   *
   * It MUST be a total order (end with a unique column) and MUST match the board's
   * ORDER BY exactly. Two rows that tie come back in whatever order the planner
   * picks, so without a final tie-break the backfill would reproduce a different
   * order than the one on screen and arranging one card would shuffle its
   * neighbours.
   */
  defaultOrder: string
}

// Every table this helper may touch. The table name is interpolated into SQL (it
// cannot be a bound parameter), so it is checked against this frozen list rather
// than trusted - even though today every caller passes a constant.
const ALLOWED_TABLES = [
  'tax_tasks',
  'tax_personal_tasks',
  'mortgage_tasks',
  'mortgage_personal_tasks',
] as const

export const BOARD_ORDER_TABLES = {
  taxTasks: {
    table: 'tax_tasks',
    defaultOrder: 'due_date ASC NULLS LAST, created_at DESC, id DESC',
  },
  taxPersonalTasks: {
    table: 'tax_personal_tasks',
    defaultOrder: 'due_date ASC NULLS LAST, id DESC',
  },
  mortgageTasks: {
    table: 'mortgage_tasks',
    defaultOrder: 'created_at DESC, id DESC',
  },
  mortgagePersonalTasks: {
    table: 'mortgage_personal_tasks',
    defaultOrder: 'due_date ASC NULLS LAST, id DESC',
  },
} as const satisfies Record<string, BoardOrderTable>

function assertTable(cfg: BoardOrderTable): void {
  if (!(ALLOWED_TABLES as readonly string[]).includes(cfg.table)) {
    throw new Error(`board-order: refusing to touch unknown table "${cfg.table}"`)
  }
}

// Give every live row in this status column a fresh, evenly spaced position,
// preserving whatever order it currently displays in. Runs the first time a column
// is arranged (everything is NULL until then) and again if a gap ever closes past
// what a midpoint can split - so this path is exercised on every board's first
// drag rather than being cold code nobody has run.
async function renumberColumn(
  tx: PoolClient,
  cfg: BoardOrderTable,
  status: string,
): Promise<void> {
  await tx.query(
    `UPDATE ${cfg.table} AS t
     SET board_position = r.pos
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                ORDER BY board_position ASC NULLS LAST, ${cfg.defaultOrder}
              ) * $2::float AS pos
       FROM ${cfg.table}
       WHERE status = $1 AND is_deleted = FALSE
     ) AS r
     WHERE t.id = r.id`,
    [status, SPACING],
  )
}

// The position that puts `id` immediately after `afterId` (or at the top of the
// column when afterId is null). Returns null when the surviving gap is too small
// to split, which tells the caller to renumber and ask again.
async function midpointAfter(
  tx: PoolClient,
  cfg: BoardOrderTable,
  id: string,
  status: string,
  afterId: string | null,
): Promise<number | null> {
  if (afterId === null) {
    // Top of the column. The card itself is excluded so that "move to top" is
    // still a move when the card is already top.
    const result = await tx.query(
      `SELECT MIN(board_position) AS m FROM ${cfg.table}
       WHERE status = $1 AND is_deleted = FALSE AND id <> $2`,
      [status, id],
    )
    const min = result.rows[0].m as number | null
    return min === null ? SPACING : min - SPACING
  }

  const prevResult = await tx.query(
    `SELECT board_position FROM ${cfg.table}
     WHERE id = $1 AND status = $2 AND is_deleted = FALSE`,
    [afterId, status],
  )
  if (prevResult.rows.length === 0) {
    // The card it was dropped after has moved or been deleted since the board
    // loaded. A conflict, not a server error - the client should refresh.
    throw new AppError(
      'That card is no longer in this column. Refresh the board and try again.',
      HTTP_STATUS.CONFLICT,
    )
  }
  const prev = prevResult.rows[0].board_position as number

  // The next card down, excluding the one being moved - otherwise dragging a card
  // downwards would measure the gap against its own current position.
  const nextResult = await tx.query(
    `SELECT MIN(board_position) AS m FROM ${cfg.table}
     WHERE status = $1 AND is_deleted = FALSE AND id <> $2 AND board_position > $3`,
    [status, id, prev],
  )
  const next = nextResult.rows[0].m as number | null

  if (next === null) return prev + SPACING
  if (next - prev < MIN_GAP) return null
  return (prev + next) / 2
}

/**
 * Move `id` to sit immediately after `afterId` within its status column, or to the
 * top when `afterId` is null. Returns the position written.
 *
 * The whole column is locked FOR UPDATE first, so two people dragging in the same
 * column at the same time cannot compute the same midpoint and land on top of each
 * other - the second one waits and measures against the first one's result.
 */
export async function repositionOnBoard(
  cfg: BoardOrderTable,
  id: string,
  status: string,
  afterId: string | null,
): Promise<number> {
  assertTable(cfg)
  if (afterId === id) {
    throw new AppError('A card cannot be dropped after itself', HTTP_STATUS.BAD_REQUEST)
  }

  const tx = await db.connect()
  try {
    await tx.query('BEGIN')

    await tx.query(
      `SELECT id FROM ${cfg.table} WHERE status = $1 AND is_deleted = FALSE FOR UPDATE`,
      [status],
    )

    // Untouched column: everything is NULL, so hand out positions in the order the
    // board is already showing before working out where the card goes.
    const unset = await tx.query(
      `SELECT 1 FROM ${cfg.table}
       WHERE status = $1 AND is_deleted = FALSE AND board_position IS NULL LIMIT 1`,
      [status],
    )
    if (unset.rows.length > 0) await renumberColumn(tx, cfg, status)

    let position = await midpointAfter(tx, cfg, id, status, afterId)
    if (position === null) {
      await renumberColumn(tx, cfg, status)
      position = await midpointAfter(tx, cfg, id, status, afterId)
    }
    if (position === null) {
      // Only reachable if a freshly renumbered column still had no room, which
      // cannot happen with SPACING of 1000 - so this is a bug, not a user error.
      throw new Error('board-order: no room for a midpoint after renumbering')
    }

    await tx.query(`UPDATE ${cfg.table} SET board_position = $2 WHERE id = $1`, [id, position])
    await tx.query('COMMIT')
    return position
  } catch (error) {
    await tx.query('ROLLBACK')
    throw error
  } finally {
    tx.release()
  }
}
