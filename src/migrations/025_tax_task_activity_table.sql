-- Table: tax_task_activity
-- Purpose: The audit log for a tax-practice task — one row per tracked event
--          (created, status change, reassignment, checklist tick, comment added,
--          …). Every change to a task is recorded here so the task's history is
--          fully reconstructable. Read access is gated by TAX_TASK.VIEW_ACTIVITY.
--
--          APPEND-ONLY: rows are never edited or deleted, so there is deliberately
--          NO updated_at, NO trigger, and NO soft-delete. An audit trail you can
--          rewrite is not an audit trail.
--
--          `action` is a short event code written by the service layer from a
--          central vocabulary (src/config/task-activity-actions.constants.ts, added
--          when the emitting routes are built). Expected codes include:
--            task_created, status_changed, priority_changed, due_date_changed,
--            description_changed, preparer_changed, reviewer_changed,
--            checklist_item_added, checklist_item_removed,
--            checklist_item_checked, checklist_item_unchecked,
--            comment_added, comment_edited, comment_deleted
--          There is intentionally NO DB CHECK on `action`: audit event types grow
--          over time and should not need a migration each time. The app is the
--          source of truth for the vocabulary (all writes go through the service).
--
--          `detail` is per-event context as JSONB, e.g.
--            status_changed        -> { "from": "in_process", "to": "in_review" }
--            preparer_changed      -> { "from": "<member id>", "to": "<member id>" }
--            checklist_item_checked-> { "item_id": "...", "heading": "Bank statements" }
--            comment_added         -> { "comment_id": "..." }

CREATE TABLE IF NOT EXISTS tax_task_activity (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The task this event belongs to.
    task_id TEXT NOT NULL REFERENCES tax_tasks(id),

    -- Who performed the action.
    actor_id TEXT NOT NULL REFERENCES members(id),

    -- Short event code (see header). Free TEXT, validated in the app.
    action TEXT NOT NULL,

    -- Per-event context (see header for shapes).
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- When the event happened (UTC). Append-only: no updated_at.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline lookups: a task's events in chronological order.
CREATE INDEX idx_tax_task_activity_task
    ON tax_task_activity (task_id, created_at);
