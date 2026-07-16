-- Table: mortgage_personal_tasks
-- Purpose: A lightweight, PRIVATE to-do owned by a team member (the creator), in the
--          MORTGAGE department. Mirrors tax_personal_tasks (028) — no client, loan,
--          firm, priority, notes-status or activity; just a title, description, an
--          optional due date, a status, and a set of followers (separate table).
--
--          DEPARTMENT-SCOPED: this table holds mortgage personal tasks only (the tax
--          equivalent is tax_personal_tasks).
--
--          Visibility (enforced in the service layer, NOT the DB): visible ONLY to
--          its creator (created_by) and the members listed as followers. Nobody else.
--
--          `status` is the FIXED task lifecycle (src/config/task-statuses.constants.ts),
--          the SAME set the service tasks use, pinned here by a CHECK.
--
--          Soft-delete columns are present for forward-compatibility; there is NO
--          delete flow yet (deferred).

CREATE TABLE IF NOT EXISTS mortgage_personal_tasks (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    title       TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_process', 'in_review', 'completed')),

    due_date TIMESTAMPTZ,

    created_by TEXT NOT NULL REFERENCES members(id),

    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_personal_tasks_creator ON mortgage_personal_tasks (created_by) WHERE is_deleted = FALSE;
CREATE INDEX idx_mortgage_personal_tasks_status  ON mortgage_personal_tasks (status)     WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_mortgage_personal_tasks
    BEFORE UPDATE ON mortgage_personal_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
