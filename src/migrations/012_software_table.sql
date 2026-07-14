-- Table: software
-- Purpose: "Simple" master data — accounting software clients use (e.g. Xero,
--          MYOB, QuickBooks). Practice-wide (not per-department); a flat name +
--          description lookup list served by its own module (src/modules/software).
--          Name is unique among non-deleted rows
--          (case-insensitive).
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS software (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    name VARCHAR(160) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_software_name_unique ON software (LOWER(name)) WHERE is_deleted = FALSE;
CREATE INDEX idx_software_not_deleted ON software (is_deleted) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_software
    BEFORE UPDATE ON software
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
