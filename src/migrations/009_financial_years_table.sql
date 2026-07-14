-- Table: financial_years
-- Purpose: Master list of financial years (e.g. '2024-25'). Practice-wide (not
--          per-department). Tasks and other modules reference these later.
--
--          Exactly one financial year may be flagged `is_current` at a time. The
--          service enforces this in a transaction; the partial unique index below
--          is the DB-level safety net.
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet — financial years cannot be deleted (see the
--          root CLAUDE.md; the delete module is deferred).

CREATE TABLE IF NOT EXISTS financial_years (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The financial year label — free text (e.g. '2024-25', 'FY2024').
    year VARCHAR(20) NOT NULL,

    -- Only one financial year is "current" at any time (enforced below).
    is_current BOOLEAN NOT NULL DEFAULT FALSE,

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
CREATE INDEX idx_financial_years_not_deleted ON financial_years(is_deleted) WHERE is_deleted = FALSE;

-- No duplicate year labels among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX idx_financial_years_year_unique
    ON financial_years (LOWER(year))
    WHERE is_deleted = FALSE;

-- At most one current financial year among non-deleted rows.
CREATE UNIQUE INDEX idx_financial_years_single_current
    ON financial_years ((is_current))
    WHERE is_current = TRUE AND is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_financial_years
    BEFORE UPDATE ON financial_years
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
