import { db } from '../../../lib/db'
import { mortgageTaskMessages } from '../config/mortgage-tasks.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { MORTGAGE_TASK_ACTIVITY_ACTIONS } from '../../../config/mortgage-task-activity-actions.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import { mortgageTaskService } from './mortgage-tasks.service'
import type {
  CreateMortgageTaskCommentRequest,
  UpdateMortgageTaskCommentRequest,
  MortgageTaskCommentView,
  MortgageTaskCommentListResponse,
} from '../types/mortgage-tasks.types'

const COMMENT_SELECT = `
  c.id, c.parent_id, c.author_id,
  CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS author_name,
  c.body, c.edited, c.is_deleted, c.created_at, c.updated_at`

function toView(row: any, replies: MortgageTaskCommentView[] = []): MortgageTaskCommentView {
  return {
    id: row.id,
    parent_id: row.parent_id,
    author_id: row.author_id,
    author_name: row.author_name,
    body: row.is_deleted ? null : row.body, // tombstone: hide the text
    edited: row.edited,
    is_deleted: row.is_deleted,
    created_at: row.created_at,
    updated_at: row.updated_at,
    replies,
  }
}

// Two-level thread: top-level comments, each with its live replies. A deleted
// top-level comment is kept as a tombstone only if it still has live replies.
function buildTree(rows: any[]): MortgageTaskCommentView[] {
  const repliesByParent = new Map<string, any[]>()
  for (const r of rows) {
    if (r.parent_id !== null && !r.is_deleted) {
      const arr = repliesByParent.get(r.parent_id) ?? []
      arr.push(r)
      repliesByParent.set(r.parent_id, arr)
    }
  }
  const out: MortgageTaskCommentView[] = []
  for (const r of rows) {
    if (r.parent_id !== null) continue
    const replies = (repliesByParent.get(r.id) ?? []).map((rp) => toView(rp))
    if (r.is_deleted && replies.length === 0) continue
    out.push(toView(r, replies))
  }
  return out
}

export const mortgageTaskCommentService = {
  async list(actingUser: AuthUser, taskId: string): Promise<MortgageTaskCommentListResponse> {
    await mortgageTaskService.loadVisibleRow(actingUser, taskId)
    return this.fetchThread(taskId)
  },

  async fetchThread(taskId: string): Promise<MortgageTaskCommentListResponse> {
    const result = await db.query(
      `SELECT ${COMMENT_SELECT}
       FROM mortgage_task_comments c
       LEFT JOIN members a ON a.id = c.author_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC, c.id ASC`,
      [taskId],
    )
    return { items: buildTree(result.rows) }
  },

  async getView(commentId: string): Promise<MortgageTaskCommentView> {
    const result = await db.query(
      `SELECT ${COMMENT_SELECT}
       FROM mortgage_task_comments c
       LEFT JOIN members a ON a.id = c.author_id
       WHERE c.id = $1`,
      [commentId],
    )
    return toView(result.rows[0])
  },

  async create(
    actingUser: AuthUser,
    taskId: string,
    data: CreateMortgageTaskCommentRequest,
  ): Promise<MortgageTaskCommentView> {
    await mortgageTaskService.loadVisibleRow(actingUser, taskId)

    const parentId = data.parent_id ?? null
    if (parentId) {
      const parent = await db.query(
        `SELECT parent_id, is_deleted FROM mortgage_task_comments WHERE id = $1 AND task_id = $2`,
        [parentId, taskId],
      )
      if (parent.rows.length === 0 || parent.rows[0].is_deleted) {
        throw new AppError(mortgageTaskMessages.PARENT_COMMENT_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
      }
      if (parent.rows[0].parent_id !== null) {
        throw new AppError(mortgageTaskMessages.REPLY_TO_REPLY, HTTP_STATUS.BAD_REQUEST)
      }
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO mortgage_task_comments (task_id, parent_id, author_id, body)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [taskId, parentId, actingUser.id, data.body],
      )
      const commentId = inserted.rows[0].id as string
      await mortgageTaskService.logActivity(
        client,
        taskId,
        actingUser.id,
        MORTGAGE_TASK_ACTIVITY_ACTIONS.COMMENT_ADDED,
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

  async update(
    actingUser: AuthUser,
    taskId: string,
    commentId: string,
    data: UpdateMortgageTaskCommentRequest,
  ): Promise<MortgageTaskCommentView> {
    await mortgageTaskService.loadVisibleRow(actingUser, taskId)
    const current = await this.assertOwnLiveComment(actingUser, taskId, commentId)

    // Push the superseded text onto versions and set the edited flag.
    const versionEntry = JSON.stringify([
      { body: current.body, edited_at: new Date().toISOString() },
    ])

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE mortgage_task_comments
         SET body = $1, edited = TRUE, versions = versions || $2::jsonb
         WHERE id = $3`,
        [data.body, versionEntry, commentId],
      )
      await mortgageTaskService.logActivity(
        client,
        taskId,
        actingUser.id,
        MORTGAGE_TASK_ACTIVITY_ACTIONS.COMMENT_EDITED,
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

  async remove(
    actingUser: AuthUser,
    taskId: string,
    commentId: string,
  ): Promise<{ id: string }> {
    await mortgageTaskService.loadVisibleRow(actingUser, taskId)
    await this.assertOwnLiveComment(actingUser, taskId, commentId)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE mortgage_task_comments
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1
         WHERE id = $2`,
        [actingUser.id, commentId],
      )
      await mortgageTaskService.logActivity(
        client,
        taskId,
        actingUser.id,
        MORTGAGE_TASK_ACTIVITY_ACTIONS.COMMENT_DELETED,
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

  // The comment must be a live comment on this task authored by the caller.
  async assertOwnLiveComment(
    actingUser: AuthUser,
    taskId: string,
    commentId: string,
  ): Promise<{ id: string; author_id: string; body: string }> {
    const result = await db.query(
      `SELECT id, author_id, body FROM mortgage_task_comments
       WHERE id = $1 AND task_id = $2 AND is_deleted = FALSE`,
      [commentId, taskId],
    )
    if (result.rows.length === 0) {
      throw new AppError(mortgageTaskMessages.COMMENT_NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }
    if (result.rows[0].author_id !== actingUser.id) {
      throw new AppError(mortgageTaskMessages.COMMENT_NOT_AUTHOR, HTTP_STATUS.FORBIDDEN)
    }
    return result.rows[0]
  },
}
