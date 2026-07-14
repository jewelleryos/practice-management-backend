-- Table: entity_types
-- Purpose: "Simple" master data — client entity types (e.g. Individual, Company,
--          Trust). Practice-wide (not per-department); a flat name + description
--          lookup list served by its own module (src/modules/entity-types).
--          Name is unique among non-deleted rows
--          (case-insensitive).
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS entity_types (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    name VARCHAR(160) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_entity_types_name_unique ON entity_types (LOWER(name)) WHERE is_deleted = FALSE;
CREATE INDEX idx_entity_types_not_deleted ON entity_types (is_deleted) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_entity_types
    BEFORE UPDATE ON entity_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
