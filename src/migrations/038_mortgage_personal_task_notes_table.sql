-- Table: mortgage_personal_task_notes
-- Purpose: The running notes on a mortgage personal task. A task can have MANY notes;
--          any member who can see the task (its creator or a follower) may add notes.
--          Mirrors tax_personal_task_notes (029). Soft-delete columns present; no
--          delete flow yet (deferred).

CREATE TABLE IF NOT EXISTS mortgage_personal_task_notes (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    task_id TEXT NOT NULL REFERENCES mortgage_personal_tasks(id),

    body TEXT NOT NULL,

    created_by TEXT NOT NULL REFERENCES members(id),

    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_personal_task_notes_task ON mortgage_personal_task_notes (task_id) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_mortgage_personal_task_notes
    BEFORE UPDATE ON mortgage_personal_task_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
