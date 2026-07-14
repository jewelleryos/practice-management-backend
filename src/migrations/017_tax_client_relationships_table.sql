-- Table: tax_client_relationships
-- Purpose: Links a tax client to ANOTHER tax client with a relation type (e.g.
--          "Director of", "Shareholder of"). A client can have many. Each row is
--          stored once and shown from BOTH sides: viewing a client lists rows
--          where it is `client_id` (outgoing) AND rows where it is
--          `related_client_id` (incoming/reverse) — derived by query, not duplicated.

CREATE TABLE IF NOT EXISTS tax_client_relationships (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The client this relationship was added on.
    client_id TEXT NOT NULL REFERENCES tax_clients(id),
    relation_type_id TEXT NOT NULL REFERENCES relation_types(id),
    -- The other client in the relationship.
    related_client_id TEXT NOT NULL REFERENCES tax_clients(id),

    -- A client cannot be related to itself.
    CONSTRAINT chk_tax_client_rel_not_self CHECK (client_id <> related_client_id),

    -- Soft delete
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_client_rel_client ON tax_client_relationships (client_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tax_client_rel_related ON tax_client_relationships (related_client_id) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_tax_client_relationships
    BEFORE UPDATE ON tax_client_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
