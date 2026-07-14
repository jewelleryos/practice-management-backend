-- Table: tax_client_notes
-- Purpose: Notes attached to a tax client. A client can have many. Each carries a
--          note type (from the Note Types master) and free text. Note types can be
--          flagged sensitive; notes of a sensitive type are only returned to
--          members holding TAX_CLIENT.VIEW_SENSITIVE_NOTES (1005) — otherwise they
--          are excluded entirely (never masked). Enforced in the service layer.

CREATE TABLE IF NOT EXISTS tax_client_notes (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    client_id TEXT NOT NULL REFERENCES tax_clients(id),
    note_type_id TEXT NOT NULL REFERENCES note_types(id),
    text TEXT NOT NULL,

    -- Member who wrote the note.
    created_by TEXT REFERENCES members(id),

    -- Soft delete
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_client_notes_client ON tax_client_notes (client_id) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_tax_client_notes
    BEFORE UPDATE ON tax_client_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
