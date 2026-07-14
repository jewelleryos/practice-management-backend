-- Table: tax_personal_tasks
-- Purpose: A lightweight, PRIVATE to-do owned by a team member (the creator),
--          in the TAX-PRACTICE department. Unlike tax_tasks it has NO client,
--          service, period, priority, checklist, reviewer, comments or activity
--          log — just a name, description, an optional due date, a status, and a
--          set of followers (a separate join table).
--
--          DEPARTMENT-SCOPED: this table holds tax-practice personal tasks only.
--          Mortgage personal tasks get their own `mortgage_personal_tasks` table
--          later, mirroring how clients / service tasks are split per department.
--
--          Visibility (enforced in the service layer, NOT the DB): a personal
--          task is visible ONLY to its creator (created_by) and the members listed
--          as followers (tax_personal_task_followers). Nobody else sees it — not
--          even a member with "view all tasks". This is a business rule, distinct
--          from the VIEW_ALL / VIEW_ASSIGNED scope the service task uses.
--
--          `status` is the FIXED task lifecycle (src/config/task-statuses.constants.ts),
--          the SAME set the service task uses, pinned here by a CHECK.
--
--          `due_date` is OPTIONAL and stored as TIMESTAMPTZ (UTC) like every other
--          instant in this app, and shown in each viewer's local timezone.
--
--          Soft-delete columns are present for forward-compatibility; there is NO
--          delete flow yet (deferred — no DELETE route/UI).

CREATE TABLE IF NOT EXISTS tax_personal_tasks (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The task's name and optional free-text description.
    title       TEXT NOT NULL,
    description TEXT,

    -- Fixed task lifecycle status (see task-statuses.constants.ts).
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_process', 'in_review', 'completed')),

    -- When the task is due (UTC; shown in the viewer's local timezone). Optional.
    due_date TIMESTAMPTZ,

    -- The creator / owner. Always sees the task (independent of the follower list)
    -- and can never be removed from it. A member id.
    created_by TEXT NOT NULL REFERENCES members(id),

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps (UTC).
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup indexes (common filters).
CREATE INDEX idx_tax_personal_tasks_creator ON tax_personal_tasks (created_by) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_personal_tasks_status  ON tax_personal_tasks (status)     WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at.
CREATE TRIGGER set_updated_at_tax_personal_tasks
    BEFORE UPDATE ON tax_personal_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
