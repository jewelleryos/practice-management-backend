-- Table: tax_client_services
-- Purpose: Services a tax client receives. A client can have many. Each carries a
--          service (from the Services master), a delivery frequency (one of the
--          chosen service's frequencies — validated in the service layer), a short
--          description, and an OPTIONAL assignee (a team member).

CREATE TABLE IF NOT EXISTS tax_client_services (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    client_id TEXT NOT NULL REFERENCES tax_clients(id),
    service_id TEXT NOT NULL REFERENCES services(id),

    -- One of the fixed frequency codes (same set as the services master).
    frequency TEXT NOT NULL
        CHECK (frequency IN ('yearly', 'quarterly', 'fortnightly', 'weekly')),

    short_description TEXT,

    -- Optional per-service assignee (member). Unrelated to the client-level assignee.
    assignee_id TEXT REFERENCES members(id),

    -- Soft delete
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_client_services_client ON tax_client_services (client_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_client_services_service ON tax_client_services (service_id) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_tax_client_services
    BEFORE UPDATE ON tax_client_services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
