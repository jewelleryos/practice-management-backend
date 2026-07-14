-- Table: tax_tasks
-- Purpose: A unit of work done for one TAX-PRACTICE client, for one service,
--          covering one period of time. The same client+service produces many
--          tasks over time (one per cycle) — the PERIOD is what tells them apart.
--
--          DEPARTMENT-SCOPED: this table holds tax-practice tasks only. Mortgage
--          tasks live in a separate `mortgage_tasks` table (built later), so a
--          tax-practice user never sees mortgage tasks and vice versa — mirroring
--          how clients are split into tax_clients / mortgage_clients.
--
--          Period model (agreed): every task always has a financial year; how
--          much MORE period detail it carries depends on the service's frequency:
--            yearly      -> financial year only
--            quarterly   -> + quarter          (1-4)
--            monthly     -> + month            (1-12)
--            fortnightly -> + month + half      (half = 1 or 2)
--            weekly      -> + month + week      (1-5)
--          The sub-period columns (quarter/month/fortnight_half/week) are
--          NOT NULL DEFAULT 0, where 0 means "not applicable at this frequency".
--          Using 0 (not NULL) is deliberate: a plain unique index treats NULLs as
--          distinct, so two yearly tasks (all sub-periods NULL) would both be
--          allowed — 0 makes the uniqueness rule work for every frequency.
--
--          Uniqueness: at most ONE non-deleted task per
--            (client, service, financial_year, quarter, month, fortnight_half, week).
--
--          `status` is the FIXED task lifecycle (src/config/task-statuses.constants.ts),
--          pinned here by a CHECK. `frequency` is copied from the service at
--          creation and says which sub-period columns are meaningful.
--
--          `due_date` is stored as TIMESTAMPTZ (UTC) like every other instant in
--          this app, and shown in each viewer's local timezone.
--
--          Soft-delete columns are present for forward-compatibility; there is NO
--          delete flow yet (deferred; see root CLAUDE.md).
--
--          `priority` is the FIXED urgency scale (src/config/task-priorities.constants.ts),
--          pinned by a CHECK; defaults to 'medium'.
--
--          `checklist` is an EMBEDDED JSONB array (not a separate table): a task's
--          checklist is small (~6 items), always loaded with the task, and never
--          queried across tasks, so it lives inline. At task creation the service's
--          ACTIVE checklist items are copied in; after that it is independent.
--          Each element:
--            { id, heading, description, is_required, is_done, done_by, done_at }
--          where id is a ULID generated per item, done_by is a member id, and
--          done_at is a UTC timestamp. Validation lives in the app (Zod). The
--          "all required items done before status -> completed" rule is enforced
--          in the service layer, not the DB.
--
--          NOT included (by decision): query reason code and document uploads.
--          Comments and the activity log ARE separate tables (they grow unbounded
--          and are appended/queried), built in later steps.

CREATE TABLE IF NOT EXISTS tax_tasks (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- Task type discriminator (see the shape CHECK at the bottom):
    --   'service' — generated from a service + frequency + period; carries a
    --               service_id, a frequency, and NO title (it's labelled by its
    --               service). This is every existing task.
    --   'general' — an ad-hoc task with a plain title and no service/frequency/
    --               period/reviewer. Still belongs to a client + financial year.
    task_type TEXT NOT NULL DEFAULT 'service'
        CHECK (task_type IN ('service', 'general')),

    -- What the task is for. client_id + financial_year_id are required for BOTH
    -- task types. service_id is NULL for general tasks (enforced by the shape
    -- CHECK), so it is nullable here.
    client_id TEXT NOT NULL REFERENCES tax_clients(id),
    service_id TEXT REFERENCES services(id),
    financial_year_id TEXT NOT NULL REFERENCES financial_years(id),

    -- The general task's name. NULL for service tasks (labelled by their service);
    -- required for general tasks (both enforced by the shape CHECK).
    title TEXT,

    -- The cadence this task belongs to (copied from the service). One of the
    -- fixed frequency codes; tells which sub-period columns below are meaningful.
    -- 'one_time' = ad-hoc work: no sub-period (all sub-period cols stay 0) and,
    -- unlike the recurring frequencies, NOT bound by the per-period uniqueness
    -- rule below (so a client can have many one-time tasks for the same service).
    -- NULL for general tasks (they have no cadence; enforced by the shape CHECK).
    frequency TEXT
        CHECK (frequency IN ('yearly', 'quarterly', 'monthly', 'fortnightly', 'weekly', 'one_time')),

    -- Sub-period. 0 = not applicable at this frequency (see header note).
    quarter        SMALLINT NOT NULL DEFAULT 0 CHECK (quarter        BETWEEN 0 AND 4),
    month          SMALLINT NOT NULL DEFAULT 0 CHECK (month          BETWEEN 0 AND 12),
    fortnight_half SMALLINT NOT NULL DEFAULT 0 CHECK (fortnight_half BETWEEN 0 AND 2),
    week           SMALLINT NOT NULL DEFAULT 0 CHECK (week           BETWEEN 0 AND 5),

    -- Informational period date range, purely for display. It has NO link to the
    -- due date, creation, or any logic — it just records the calendar span the
    -- task's period covers. Captured for weekly & fortnightly tasks and for
    -- one_time tasks (the ad-hoc job's own range); null at every other
    -- frequency. Pure calendar dates (DATE, not TIMESTAMPTZ): a week
    -- or fortnight span is the same regardless of the viewer's timezone.
    period_start_date DATE,
    period_end_date   DATE,

    -- Free-text description of the task. Optional.
    description TEXT,

    -- Fixed task lifecycle status (see task-statuses.constants.ts).
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_process', 'in_review', 'completed')),

    -- Urgency (see task-priorities.constants.ts). Defaults to 'medium'.
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    -- When the task is due (UTC; displayed in the viewer's local timezone). Optional.
    due_date TIMESTAMPTZ,

    -- Embedded checklist (see header for the element shape). Copied from the
    -- service's active checklist items at creation; independent thereafter.
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Who prepares and who reviews (team members). Both optional.
    preparer_id TEXT REFERENCES members(id),
    reviewer_id TEXT REFERENCES members(id),

    -- The work status (admin master) this task currently sits at. This is the
    -- editable progress label, distinct from the fixed lifecycle `status` above.
    -- Set from the create form (pre-filled with the master's default) at creation;
    -- nullable when no default exists / none is chosen.
    work_status_id TEXT REFERENCES work_statuses(id),

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps (UTC).
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Period dates apply to weekly / fortnightly (the span the sub-period covers)
    -- and to one_time (the ad-hoc job's own date range); null at every other
    -- frequency.
    CONSTRAINT chk_tax_tasks_period_dates_frequency CHECK (
        frequency IN ('weekly', 'fortnightly', 'one_time')
        OR (period_start_date IS NULL AND period_end_date IS NULL)
    ),
    -- When both are set, the end must not precede the start.
    CONSTRAINT chk_tax_tasks_period_dates_order CHECK (
        period_start_date IS NULL OR period_end_date IS NULL
        OR period_end_date >= period_start_date
    ),

    -- Shape by task type. A service task is generated from a service, so it needs
    -- a service_id + frequency and has no title. A general task is ad-hoc: a title,
    -- no service/frequency, no reviewer, and no period at all (all sub-periods 0,
    -- no period dates). client_id + financial_year_id are required for both
    -- (columns above stay NOT NULL).
    CONSTRAINT chk_tax_tasks_shape CHECK (
        (task_type = 'service'
            AND service_id IS NOT NULL
            AND frequency IS NOT NULL
            AND title IS NULL)
        OR
        (task_type = 'general'
            AND service_id IS NULL
            AND frequency IS NULL
            AND title IS NOT NULL
            AND reviewer_id IS NULL
            AND quarter = 0 AND month = 0 AND fortnight_half = 0 AND week = 0
            AND period_start_date IS NULL AND period_end_date IS NULL)
    )
);

-- One task per client + service + full period, among non-deleted rows.
-- one_time is EXEMPT: ad-hoc work can repeat freely, so a client can have many
-- one-time tasks for the same service + financial year. General tasks are EXEMPT
-- too (they have no service/period and can repeat freely) — scoped out here.
CREATE UNIQUE INDEX idx_tax_tasks_client_service_period_unique
    ON tax_tasks (client_id, service_id, financial_year_id, quarter, month, fortnight_half, week)
    WHERE is_deleted = FALSE AND task_type = 'service' AND frequency <> 'one_time';

-- Lookup indexes (common filters).
CREATE INDEX idx_tax_tasks_client          ON tax_tasks (client_id)         WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_tasks_service         ON tax_tasks (service_id)        WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_tasks_financial_year  ON tax_tasks (financial_year_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_tasks_status          ON tax_tasks (status)            WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_tasks_preparer        ON tax_tasks (preparer_id)       WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_tasks_reviewer        ON tax_tasks (reviewer_id)       WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_tasks_work_status     ON tax_tasks (work_status_id)    WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at.
CREATE TRIGGER set_updated_at_tax_tasks
    BEFORE UPDATE ON tax_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
