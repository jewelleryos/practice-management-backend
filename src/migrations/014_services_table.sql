-- Table: services
-- Purpose: Master list of services the practice offers (e.g. 'Individual Tax
--          Return', 'BAS Preparation'). Each service belongs to exactly ONE
--          department (tax_practice | mortgage), so each department has its own
--          set of services. Tasks are created in bulk by service later, so tasks
--          reference these.
--
--          Each service carries one or more FIXED frequencies (yearly, quarterly,
--          fortnightly, weekly) describing the cadences it can be delivered at.
--          The allowed set is a code-level constant
--          (src/config/service-frequencies.constants.ts); the CHECK below is the
--          DB-level safety net. The service enforces "at least one frequency".
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred; see root CLAUDE.md).

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- Which department this service belongs to (fixed set — validated here too).
    department TEXT NOT NULL CHECK (department IN ('tax_practice', 'mortgage')),

    name VARCHAR(160) NOT NULL,
    -- Short human code for the service (e.g. 'ITR', 'BAS'). Unique among
    -- non-deleted rows (case-insensitive), like name.
    code VARCHAR(40) NOT NULL,
    description TEXT,

    -- The cadences this service can be delivered at. Values are constrained to
    -- the fixed set; order is not significant and duplicates are removed by the
    -- service before insert.
    frequencies TEXT[] NOT NULL DEFAULT '{}',

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Every element must be one of the fixed frequency codes.
    CONSTRAINT chk_services_frequencies
        CHECK (frequencies <@ ARRAY['yearly', 'quarterly', 'fortnightly', 'weekly']::TEXT[])
);

-- Indexes
CREATE INDEX idx_services_not_deleted ON services (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_services_department ON services (department) WHERE is_deleted = FALSE;

-- No duplicate service names within a department (case-insensitive).
CREATE UNIQUE INDEX idx_services_name_unique
    ON services (department, LOWER(name))
    WHERE is_deleted = FALSE;

-- No duplicate service codes within a department (case-insensitive).
CREATE UNIQUE INDEX idx_services_code_unique
    ON services (department, LOWER(code))
    WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_services
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
