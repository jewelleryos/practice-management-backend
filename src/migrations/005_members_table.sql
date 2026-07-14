-- Table: members
-- Purpose: Team members (staff accounts). No public registration — an admin
--          creates each member, sets the initial password, and it is emailed to
--          them. Members are never deleted, only deactivated (is_active = FALSE)
--          or soft-deleted (is_deleted = TRUE).
--
-- Access model:
--   * role_id      — exactly ONE global role (same role across every firm).
--   * departments  — which departments the member can switch into (fixed codes).
--   * member_firms — which firms' data the member can see (separate join table).
--   * effective permissions = (role.permissions ∪ extra) − revoked, then GATED
--     so a permission only applies if it is global or belongs to a department
--     the member has access to.

CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- Member basic information
    email VARCHAR(255) NOT NULL UNIQUE CHECK (email = LOWER(email)),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(25),

    -- Profile photo. Populated from the Google account on first Google login
    -- if not already set (Google auth is added later, once this module is done).
    photo_url TEXT,

    -- Authentication (admin sets the password at creation; member can change it later)
    password TEXT NOT NULL,
    password_reset_token TEXT,
    password_reset_expires_at TIMESTAMPTZ,

    -- Access control — one global role + optional per-member overrides.
    role_id TEXT REFERENCES roles(id),
    extra_permissions INTEGER[] NOT NULL DEFAULT '{}',
    revoked_permissions INTEGER[] NOT NULL DEFAULT '{}',

    -- Department access (which departments the member can switch into). Firm
    -- access is separate (member_firms). Only valid department codes allowed.
    departments TEXT[] NOT NULL DEFAULT '{}'
        CHECK (departments <@ ARRAY['tax_practice', 'mortgage']::text[]),

    -- Login tracking and security
    last_login_at TIMESTAMPTZ,
    login_attempt_count INTEGER NOT NULL DEFAULT 0,
    last_failed_login_at TIMESTAMPTZ,
    account_locked_until TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no self-FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Metadata (flexible key-value storage)
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_role_id ON members(role_id);
CREATE INDEX idx_members_is_active ON members(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_members_not_deleted ON members(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_members_departments ON members USING GIN (departments);

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_members
    BEFORE UPDATE ON members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
