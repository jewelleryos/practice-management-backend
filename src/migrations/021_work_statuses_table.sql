-- Table: work_statuses
-- Purpose: Master list of work statuses used to track a task's progress (e.g.
--          'Not Started', 'In Progress', 'With Client', 'Completed'). Practice-wide
--          (not per-department). Each status carries a display `color` (hex) used to
--          render its coloured chip, and an `is_active` flag so a status can be
--          retired without deleting it. Served by its own module
--          (src/modules/work-statuses). Name is unique among non-deleted rows
--          (case-insensitive).
--
--          `sort_order` controls display order; it is auto-managed for now (not
--          exposed in the form) and can be surfaced later for manual reordering.
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS work_statuses (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    name VARCHAR(120) NOT NULL,

    -- Display colour as a #RRGGBB hex string (e.g. '#16A34A'). Used for the chip.
    color VARCHAR(7) NOT NULL,

    -- Active statuses are selectable; inactive ones are retired but retained.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Exactly one work status may be flagged the default at a time (enforced by
    -- the partial unique index below + the service in a transaction). The default
    -- is pre-selected when a task is generated. A default is always active — the
    -- service refuses to deactivate the current default (change it first) and
    -- refuses to make an inactive status the default.
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    -- Display order (auto-managed for now; lower sorts first).
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_work_statuses_not_deleted ON work_statuses (is_deleted) WHERE is_deleted = FALSE;

-- No duplicate work-status names among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX idx_work_statuses_name_unique
    ON work_statuses (LOWER(name))
    WHERE is_deleted = FALSE;

-- At most one default work status among non-deleted rows.
CREATE UNIQUE INDEX idx_work_statuses_single_default
    ON work_statuses ((is_default))
    WHERE is_default = TRUE AND is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_work_statuses
    BEFORE UPDATE ON work_statuses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
