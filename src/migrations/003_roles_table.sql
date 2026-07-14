-- Table: roles
-- Purpose: A named bundle of permission codes. Each member is assigned exactly
--          one GLOBAL role (the same role applies across every firm the member
--          can access); per-member overrides live on the members table. A role
--          may carry permissions for BOTH departments — a member only exercises
--          the ones for the departments they have access to (gated at runtime).

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    name VARCHAR(80) NOT NULL UNIQUE,
    description TEXT,

    -- The permission bundle (numeric codes from permissions.constants.ts)
    permissions INTEGER[] NOT NULL DEFAULT '{}',

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK: a FK to
    -- members would be circular, and members are themselves never hard-deleted).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_roles_permissions ON roles USING GIN (permissions);

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_roles
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
