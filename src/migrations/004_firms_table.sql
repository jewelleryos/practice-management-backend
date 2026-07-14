-- Table: firms
-- Purpose: Master list of firms. Each firm belongs to exactly ONE department
--          (tax_practice | mortgage — see departments.constants.ts), chosen when
--          the firm is created. Members are granted access to specific firms via
--          the member_firms join table.

CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- Which department this firm belongs to (fixed set — validated here too).
    department TEXT NOT NULL CHECK (department IN ('tax_practice', 'mortgage')),

    -- Basic details
    name VARCHAR(160) NOT NULL,
    description TEXT,
    address TEXT,
    email VARCHAR(255) CHECK (email IS NULL OR email = LOWER(email)),
    contact_no VARCHAR(25),

    -- Concern persons — a variable-length list; an admin can add as many as
    -- needed. Each entry is an object:
    --   { name, designation, membership_number, tax_agent_number, asic_agent_id }
    concern_persons JSONB NOT NULL DEFAULT '[]',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- No duplicate firm names within the same department.
    UNIQUE (department, name)
);

-- Indexes
CREATE INDEX idx_firms_department ON firms(department);
CREATE INDEX idx_firms_is_active ON firms(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_firms_not_deleted ON firms(is_deleted) WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_firms
    BEFORE UPDATE ON firms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
