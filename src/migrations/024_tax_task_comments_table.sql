-- Table: tax_task_comments
-- Purpose: Discussion on a tax-practice task. Any member who can see the task can
--          add a comment; comments support ONE level of replies (a reply points at
--          a top-level comment via parent_id). Grows unbounded over a task's life,
--          so it is a real table (not embedded JSON like the checklist).
--
--          One-level threading: a top-level comment has parent_id = NULL; a reply
--          has parent_id set to a top-level comment's id. "A reply cannot itself be
--          replied to" is enforced in the service layer (a parent must be top-level).
--
--          EDIT HISTORY: `body` is the current text. When a comment is edited, the
--          OLD body is pushed onto `versions` (a JSONB array of { body, edited_at }
--          — the change time is kept INSIDE each entry) before `body` is overwritten,
--          and the `edited` flag is set to TRUE (drives the "edited" badge). So the
--          full trail of superseded versions is retained with the time each changed.
--          Old versions are stored but not surfaced anywhere yet — kept for later.
--
--          AUTHORSHIP: only the author may edit or delete their own comment
--          (enforced in the service layer). Soft-delete retains history and keeps
--          any replies intact. deleted_by is the member id.

CREATE TABLE IF NOT EXISTS tax_task_comments (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The task this comment belongs to.
    task_id TEXT NOT NULL REFERENCES tax_tasks(id),

    -- NULL = top-level comment; set = a reply to that top-level comment.
    -- One level only (enforced in the service layer).
    parent_id TEXT REFERENCES tax_task_comments(id),

    -- Who wrote it. Only this member may edit or delete the comment.
    author_id TEXT NOT NULL REFERENCES members(id),

    -- Current text of the comment.
    body TEXT NOT NULL,

    -- Prior versions, superseded by edits: [{ body, edited_at }] (UTC times kept
    -- inside each entry). Empty until the comment is first edited.
    versions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Whether the comment has ever been edited. Drives the "edited" badge.
    edited BOOLEAN NOT NULL DEFAULT FALSE,

    -- Soft delete (finance app — records are retained, never hard-deleted).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps (UTC).
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tax_task_comments_task
    ON tax_task_comments (task_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_task_comments_parent
    ON tax_task_comments (parent_id) WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at.
CREATE TRIGGER set_updated_at_tax_task_comments
    BEFORE UPDATE ON tax_task_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
