-- Table: tax_personal_task_notes
-- Purpose: The running notes on a tax personal task. A task can have MANY notes;
--          any member who can see the task (its creator or a follower) may add
--          notes. This is a separate table (not an embedded JSONB field) because
--          notes grow unbounded and are appended over time — same reasoning as
--          the service task's comments table.
--
--          These are NOT the service task's comments/activity — a personal task
--          has neither. Notes are the only running-text feature it carries.
--
--          Soft-delete columns are present for forward-compatibility; there is NO
--          delete flow yet (deferred).

CREATE TABLE IF NOT EXISTS tax_personal_task_notes (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The task this note belongs to.
    task_id TEXT NOT NULL REFERENCES tax_personal_tasks(id),

    -- The note text.
    body TEXT NOT NULL,

    -- Who wrote the note (a member id — the creator or one of the followers).
    created_by TEXT NOT NULL REFERENCES members(id),

    -- Soft delete (retained, never hard-deleted).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps (UTC).
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All live notes for a task, newest first (the common read).
CREATE INDEX idx_tax_personal_task_notes_task ON tax_personal_task_notes (task_id) WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at.
CREATE TRIGGER set_updated_at_tax_personal_task_notes
    BEFORE UPDATE ON tax_personal_task_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
