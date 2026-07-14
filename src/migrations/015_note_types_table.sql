-- Table: note_types
-- Purpose: Master list of note types for the client Notes & Decision Log (e.g.
--          'General', 'Phone Call', 'Decision'). Practice-wide (not per-department).
--          Each type carries an `is_sensitive` flag marking notes of that type as
--          sensitive. Served by its own module (src/modules/note-types). Name is
--          unique among non-deleted rows (case-insensitive).
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS note_types (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    name VARCHAR(160) NOT NULL,
    description TEXT,

    -- Marks notes of this type as sensitive.
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,

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
CREATE INDEX idx_note_types_not_deleted ON note_types (is_deleted) WHERE is_deleted = FALSE;

-- No duplicate note-type names among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX idx_note_types_name_unique
    ON note_types (LOWER(name))
    WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_note_types
    BEFORE UPDATE ON note_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
