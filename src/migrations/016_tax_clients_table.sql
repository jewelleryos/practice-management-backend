-- Table: tax_clients
-- Purpose: Clients of the Tax Practice department. This is a DEDICATED table (the
--          Mortgage department gets its own later) because the two departments
--          collect different fields and already have separate permission sets
--          (TAX_CLIENT 1001-1005 vs MORTGAGE_CLIENT 2001-2004).
--
--          Name handling: a client is either a PERSON or a COMPANY. Either way we
--          store a single combined `name`; `is_company` records which mode it is
--          (false = person → name is "first middle last"; true = company → name is
--          the company name). On edit the UI re-splits a person name on spaces.
--
--          Visibility is firm-scoped: a member only sees clients belonging to
--          firms they have access to (member_firms). Enforced in the service.
--
--          Soft-delete columns are present; there is NO delete flow yet (deferred).

CREATE TABLE IF NOT EXISTS tax_clients (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- Owning firm (must be a tax_practice firm — checked in the service). Drives
    -- who can see this client.
    firm_id TEXT NOT NULL REFERENCES firms(id),

    -- Combined display name + person/company flag.
    name VARCHAR(200) NOT NULL,
    is_company BOOLEAN NOT NULL DEFAULT FALSE,

    -- Person-only descriptors (left null for companies).
    gender TEXT,
    title TEXT,

    entity_type_id TEXT REFERENCES entity_types(id),

    -- DOB (person) or incorporation-certificate date (company). Calendar date, no tz.
    dob_or_incorporation_date DATE,

    abn VARCHAR(20),
    acn VARCHAR(20),
    trading_name VARCHAR(200),

    -- Bank account: the account number is split into two inputs (3 + 9 chars).
    bank_account_name VARCHAR(200),
    bank_account_prefix VARCHAR(3),
    bank_account_number VARCHAR(9),

    director_id VARCHAR(50),

    client_group_id TEXT REFERENCES client_groups(id),
    software_id TEXT REFERENCES software(id),

    -- Member responsible for the WHOLE client (separate from per-service assignees).
    assignee_id TEXT REFERENCES members(id),

    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

    -- Soft delete (finance app — records are retained, never hard-deleted).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tax_clients_not_deleted ON tax_clients (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_clients_firm ON tax_clients (firm_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_clients_entity_type ON tax_clients (entity_type_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_clients_client_group ON tax_clients (client_group_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_clients_status ON tax_clients (status) WHERE is_deleted = FALSE;
-- Case-insensitive name search.
CREATE INDEX idx_tax_clients_name_lower ON tax_clients (LOWER(name)) WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_tax_clients
    BEFORE UPDATE ON tax_clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
