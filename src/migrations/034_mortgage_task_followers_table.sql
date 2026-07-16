-- Followers of a mortgage task. The creator is never stored here (they see the task
-- via created_by); followers are additional members granted access. A follower must
-- have access to the task's firm (enforced in the service). Mirrors
-- tax_personal_task_followers (030).
CREATE TABLE IF NOT EXISTS mortgage_task_followers (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    task_id TEXT NOT NULL REFERENCES mortgage_tasks(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mortgage_task_followers UNIQUE (task_id, member_id)
);

CREATE INDEX idx_mortgage_task_followers_member ON mortgage_task_followers (member_id);
