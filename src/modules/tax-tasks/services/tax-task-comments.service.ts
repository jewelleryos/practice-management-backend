import { db } from '../../../lib/db'
import { taxTaskMessages } from '../config/tax-tasks.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { TASK_ACTIVITY_ACTIONS } from '../../../config/task-activity-actions.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import { taxTaskService } from './tax-tasks.service'
import type {
  CreateTaskCommentRequest,
  UpdateTaskCommentRequest,
  TaskCommentView,
  TaskCommentListResponse,
} from '../types/tax-tasks.types'

// Columns for a comment joined with its author's name.
const COMMENT_SELECT = `
  c.id, c.parent_id, c.author_id,
  CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS author_name,
  c.body, c.edited, c.is_deleted, c.created_at, c.updated_at`

// Map a raw comment row to its view. A soft-deleted comment is a tombstone: its
// body is nulled out (the stored version history is never surfaced here).
function toView(row: any, replies: TaskCommentView[] = []): TaskCommentView {
  return {
    id: row.id,
    parent_id: row.parent_id,
    author_id: row.author_id,
    author_name: row.author_name,
    body: row.is_deleted ? null : row.body,
    edited: row.edited,
    is_deleted: row.is_deleted,
    created_at: row.created_at,
    updated_at: row.updated_at,
    replies,
  }
}

// Build the two-level thread from a flat, created_at-ASC row set (incl. deleted).
// Deleted replies are dropped; a deleted top-level comment is kept ONLY if it
// still has live replies (as a tombstone) so the thread isn't orphaned.
function buildTree(rows: any[]): TaskCommentView[] {
  const repliesByParent = new Map<string, any[]>()
  for (const r of rows) {
    if (r.parent_id !== null && !r.is_deleted) {
      const arr = repliesByParent.get(r.parent_id) ?? []
      arr.push(r)
      repliesByParent.set(r.parent_id, arr)
    }
  }
  const out: TaskCommentView[] = []
  for (const r of rows) {
    if (r.parent_id !== null) continue // replies handled under their parent
    const replies = (repliesByParent.get(r.id) ?? []).map((rp) => toView(rp))
    if (r.is_deleted && replies.length === 0) continue // fully gone
    out.push(toView(r, replies))
  }
  return out
}

export const taxTaskCommentService = {
  // ── LIST (threaded) ──
  // Anyone who can SEE the task can read its comments (loadVisibleRow gates it).
  async list(actingUser: AuthUser, taskId: string): Promise<TaskCommentListResponse> {
    await taxTaskService.loadVisibleRow(actingUser, taskId)
    const result = await db.query(
      `SELECT ${COMMENT_SELECT}
       FROM tax_task_comments c
       LEFT JOIN members a ON a.id = c.author_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC, c.id ASC`,
      [taskId],
    )
    return { items: buildTree(result.rows) }
  },

  // Fetch a single comment's view (used to return the created/edited comment).
  async getView(commentId: string): Promise<TaskCommentView> {
    const result = await db.query(
      `SELECT ${COMMENT_SELECT}
       FROM tax_task_comments c
       LEFT JOIN members a ON a.id = c.author_id
       WHERE c.id = $1`,
      [commentId],
    )
    if (result.rows.length === 0) {
      throw new AppError(taxTaskMessages.COMMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    return toView(result.rows[0])
  },

  // A live comment on this task that the caller authored — for edit / delete.
  // 404 if missing/deleted/not on this task; 403 if the caller isn't the author.
  async assertOwnLiveComment(
    actingUser: AuthUser,
    taskId: string,
    commentId: string,
  ): Promise<any> {
    const result = await db.query(
      `SELECT id, author_id, body FROM tax_task_comments
       WHERE id = $1 AND task_id = $2 AND is_deleted = FALSE`,
      [commentId, taskId],
    )
    if (result.rows.length === 0) {
      throw new AppError(taxTaskMessages.COMMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    if (result.rows[0].author_id !== actingUser.id) {
      throw new AppError(taxTaskMessages.COMMENT_NOT_AUTHOR, HTTP_STATUS.FORBIDDEN)
    }
    return result.rows[0]
  },

  // ── CREATE (comment or one-level reply) ──
  async create(
    actingUser: AuthUser,
    taskId: string,
    data: CreateTaskCommentRequest,
  ): Promise<TaskCommentView> {
    await taxTaskService.loadVisibleRow(actingUser, taskId)

    const parentId = data.parent_id ?? null
    if (parentId) {
      // The parent must be a live, top-level comment on this same task.
      const parent = await db.query(
        `SELECT parent_id, is_deleted FROM tax_task_comments
         WHERE id = $1 AND task_id = $2`,
        [parentId, taskId],
      )
      if (parent.rows.length === 0 || parent.rows[0].is_deleted) {
        throw new AppError(taxTaskMessages.PARENT_COMMENT_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
      }
      if (parent.rows[0].parent_id !== null) {
        throw new AppError(taxTaskMessages.REPLY_TO_REPLY, HTTP_STATUS.BAD_REQUEST)
      }
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO tax_task_comments (task_id, parent_id, author_id, body)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [taskId, parentId, actingUser.id, data.body],
      )
      const commentId = inserted.rows[0].id as string
      await taxTaskService.logActivity(
        client,
        taskId,
        actingUser.id,
        TASK_ACTIVITY_ACTIONS.COMMENT_ADDED,
        { comment_id: commentId, parent_id: parentId },
      )
      await client.query('COMMIT')
      return this.getView(commentId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── EDIT (author only; old text pushed to version history) ──
  async update(
    actingUser: AuthUser,
    taskId: string,
    commentId: string,
    data: UpdateTaskCommentRequest,
  ): Promise<TaskCommentView> {
    await taxTaskService.loadVisibleRow(actingUser, taskId)
    const current = await this.assertOwnLiveComment(actingUser, taskId, commentId)

    // Push the superseded text (with its change time) onto versions, set edited.
    const versionEntry = JSON.stringify([
      { body: current.body, edited_at: new Date().toISOString() },
    ])

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE tax_task_comments
         SET body = $1, edited = TRUE, versions = versions || $2::jsonb
         WHERE id = $3`,
        [data.body, versionEntry, commentId],
      )
      await taxTaskService.logActivity(
        client,
        taskId,
        actingUser.id,
        TASK_ACTIVITY_ACTIONS.COMMENT_EDITED,
        { comment_id: commentId },
      )
      await client.query('COMMIT')
      return this.getView(commentId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── DELETE (author only; soft delete keeps history + replies) ──
  async remove(
    actingUser: AuthUser,
    taskId: string,
    commentId: string,
  ): Promise<{ id: string }> {
    await taxTaskService.loadVisibleRow(actingUser, taskId)
    await this.assertOwnLiveComment(actingUser, taskId, commentId)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE tax_task_comments
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1
         WHERE id = $2`,
        [actingUser.id, commentId],
      )
      await taxTaskService.logActivity(
        client,
        taskId,
        actingUser.id,
        TASK_ACTIVITY_ACTIONS.COMMENT_DELETED,
        { comment_id: commentId },
      )
      await client.query('COMMIT')
      return { id: commentId }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },
}
