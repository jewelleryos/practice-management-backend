import { db } from '../../../lib/db'
import type { AuthUser } from '../../../middleware/auth.middleware'
import { taxTaskService } from './tax-tasks.service'
import type { TaskActivityListResponse } from '../types/tax-tasks.types'

export const taxTaskActivityService = {
  // ── LIST (chronological audit trail) ──
  // Read is gated by TAX_TASK.VIEW_ACTIVITY at the route; on top of that the caller
  // must be able to SEE the task itself (loadVisibleRow: read scope + this row),
  // so activity is never exposed for a task the caller couldn't otherwise view.
  // Ordered oldest → newest so the task's history reads top to bottom.
  async list(actingUser: AuthUser, taskId: string): Promise<TaskActivityListResponse> {
    await taxTaskService.loadVisibleRow(actingUser, taskId)
    const result = await db.query(
      `SELECT ac.id, ac.action, ac.detail, ac.actor_id,
              CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS actor_name,
              ac.created_at
       FROM tax_task_activity ac
       LEFT JOIN members a ON a.id = ac.actor_id
       WHERE ac.task_id = $1
       ORDER BY ac.created_at ASC, ac.id ASC`,
      [taskId],
    )
    return { items: result.rows }
  },
}
