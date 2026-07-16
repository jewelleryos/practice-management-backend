-- Mortgage task activity — append-only audit trail. `action` is a free-text code from
-- the app (mortgage-task-activity-actions.constants.ts; no CHECK, so the vocabulary can
-- grow without a migration). `detail` (JSONB) carries per-event context, e.g.
--   STATUS_CHANGED   -> { from, to }
--   TASK_UPDATED     -> { fields: [...] }
--   FOLLOWER_ADDED   -> { member_id, name }
--   NOTE_ADDED       -> { note_id }
-- Mirrors tax_task_activity (025).
CREATE TABLE IF NOT EXISTS mortgage_task_activity (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    task_id TEXT NOT NULL REFERENCES mortgage_tasks(id),
    actor_id TEXT NOT NULL REFERENCES members(id),
    action TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_task_activity_task ON mortgage_task_activity (task_id, created_at);
