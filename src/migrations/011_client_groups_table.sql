-- Table: client_groups
-- Purpose: "Simple" master data — groupings a client can belong to (e.g. a family
--          group). Practice-wide (not per-department); a flat name + description
--          lookup list served by its own module (src/modules/client-groups).
--          Name is unique among non-deleted rows
--          (case-insensitive).
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS client_groups (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    name VARCHAR(160) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_client_groups_name_unique ON client_groups (LOWER(name)) WHERE is_deleted = FALSE;
CREATE INDEX idx_client_groups_not_deleted ON client_groups (is_deleted) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_client_groups
    BEFORE UPDATE ON client_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
