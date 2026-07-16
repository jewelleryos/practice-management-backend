-- Notes on a mortgage task. One table for both plain notes (kind='note') and
-- status-change notes (kind='status_change'). For a status change, from_status /
-- to_status are set and body holds the mandatory description (required unless the
-- new status is not_started). Status-change notes are an immutable audit entry —
-- only plain notes can be edited / soft-deleted by their author.
CREATE TABLE IF NOT EXISTS mortgage_task_notes (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    task_id TEXT NOT NULL REFERENCES mortgage_tasks(id),
    kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','status_change')),
    body TEXT,
    from_status TEXT,                          -- set only for kind='status_change'
    to_status TEXT,                            -- set only for kind='status_change'
    created_by TEXT NOT NULL REFERENCES members(id),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_task_notes_task ON mortgage_task_notes (task_id) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_mortgage_task_notes
    BEFORE UPDATE ON mortgage_task_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
