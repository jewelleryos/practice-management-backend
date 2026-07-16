-- Mortgage task comments — a threaded discussion on a task (one level of replies),
-- distinct from the running notes. Author-scoped edit/delete, edit history retained
-- in `versions`, soft-delete (tombstone kept if it still has live replies). Mirrors
-- tax_task_comments (024).
CREATE TABLE IF NOT EXISTS mortgage_task_comments (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    task_id TEXT NOT NULL REFERENCES mortgage_tasks(id),
    -- NULL = top-level comment; set = a reply to that top-level comment.
    -- One level only (enforced in the service layer).
    parent_id TEXT REFERENCES mortgage_task_comments(id),
    -- Who wrote it. Only this member may edit or delete the comment.
    author_id TEXT NOT NULL REFERENCES members(id),
    body TEXT NOT NULL,
    -- Prior versions superseded by edits: [{ body, edited_at }]. Empty until edited.
    versions JSONB NOT NULL DEFAULT '[]'::jsonb,
    edited BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_task_comments_task ON mortgage_task_comments (task_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_mortgage_task_comments_parent ON mortgage_task_comments (parent_id) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_mortgage_task_comments
    BEFORE UPDATE ON mortgage_task_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
