-- Table: relation_types
-- Purpose: "Simple" master data — how one client relates to another (e.g.
--          Director of, Spouse of). Practice-wide (not per-department); a flat
--          name + description lookup list served by its own module
--          (src/modules/relation-types). Name is unique among non-deleted rows
--          (case-insensitive).
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS relation_types (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    name VARCHAR(160) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_relation_types_name_unique ON relation_types (LOWER(name)) WHERE is_deleted = FALSE;
CREATE INDEX idx_relation_types_not_deleted ON relation_types (is_deleted) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_relation_types
    BEFORE UPDATE ON relation_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
