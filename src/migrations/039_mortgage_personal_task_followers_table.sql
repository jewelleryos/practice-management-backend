-- Table: mortgage_personal_task_followers
-- Purpose: The followers of a mortgage personal task — the members (besides the
--          creator) who can SEE and EDIT it. A task has zero or more followers; a
--          member follows a task at most once. Mirrors tax_personal_task_followers
--          (030). The creator is NOT stored here (they see the task via created_by).
--          Follower rows are a HARD delete (a follow link isn't retained business
--          data); the parent task keeps its own soft delete.

CREATE TABLE IF NOT EXISTS mortgage_personal_task_followers (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    task_id   TEXT NOT NULL REFERENCES mortgage_personal_tasks(id),
    member_id TEXT NOT NULL REFERENCES members(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_mortgage_personal_task_followers UNIQUE (task_id, member_id)
);

CREATE INDEX idx_mortgage_personal_task_followers_member ON mortgage_personal_task_followers (member_id);
CREATE INDEX idx_mortgage_personal_task_followers_task   ON mortgage_personal_task_followers (task_id);
