-- Table: tax_personal_task_followers
-- Purpose: The followers of a tax personal task — the members (besides the
--          creator) who can SEE and EDIT it. A task has zero or more followers;
--          a member follows a task at most once (UNIQUE below).
--
--          This replaces the single-assignee model: instead of one assignee, the
--          creator loops in any number of followers, and both the creator and any
--          follower can add/remove followers.
--
--          The creator is NOT stored here — they always see the task via
--          tax_personal_tasks.created_by and cannot be removed. Follower rows are
--          managed as a HARD delete (a follow link isn't business data worth
--          retaining); the parent task keeps its own soft delete.

CREATE TABLE IF NOT EXISTS tax_personal_task_followers (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The task being followed.
    task_id   TEXT NOT NULL REFERENCES tax_personal_tasks(id),

    -- The member following it.
    member_id TEXT NOT NULL REFERENCES members(id),

    -- When the member was added as a follower (UTC).
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A member follows a given task at most once.
    CONSTRAINT uq_tax_personal_task_followers UNIQUE (task_id, member_id)
);

-- "Tasks I follow" lookups (list scoping) and per-task follower fetch.
CREATE INDEX idx_tax_personal_task_followers_member ON tax_personal_task_followers (member_id);
CREATE INDEX idx_tax_personal_task_followers_task   ON tax_personal_task_followers (task_id);
