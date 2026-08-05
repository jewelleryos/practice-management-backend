-- Table: engagement_letters
-- Purpose: One row per engagement letter GENERATED for a tax client. A client can
--          have MANY. The letter is fully described by three things:
--            • template_version — which hard-coded, versioned template (body HTML +
--              parameter definitions) it was built from (e.g. 'v1'). Old versions'
--              code is never deleted, so a pinned letter always regenerates.
--            • letterhead_id — the exact immutable firm_letterheads VERSION whose
--              header/footer is stamped on the letter.
--            • params — the parameter values (JSONB) filled in for that version.
--          No PDF is stored: the document is regenerated on the fly on download.
--
--          IMMUTABLE: a letter is created once and NEVER edited (to change anything
--          the user creates a new letter). Hence there is no updated_at column and
--          no update trigger — the service never UPDATEs this row. Soft-delete
--          columns are present only for a future delete flow (deferred).
--
--          Visibility is firm-scoped (via firm_id, enforced in the service) and the
--          whole feature is gated by a single TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS
--          permission (code 1006).

CREATE TABLE IF NOT EXISTS engagement_letters (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The client this letter is for.
    client_id TEXT NOT NULL REFERENCES tax_clients(id),

    -- Owning firm — denormalised from the client so firm-scoped queries don't have
    -- to join through tax_clients. A letter's client never changes, so this can't
    -- drift.
    firm_id TEXT NOT NULL REFERENCES firms(id),

    -- Which hard-coded template version this letter is pinned to (e.g. 'v1').
    template_version TEXT NOT NULL,

    -- The exact letter-head version (header/footer) used.
    letterhead_id TEXT NOT NULL REFERENCES firm_letterheads(id),

    -- Parameter values for the pinned template version.
    params JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Member who generated the letter.
    created_by TEXT NOT NULL REFERENCES members(id),

    -- Soft delete (finance app — records are retained; delete flow deferred).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Created only (UTC). No updated_at — the row is immutable.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A client's letters (the common read).
CREATE INDEX idx_engagement_letters_client ON engagement_letters (client_id) WHERE is_deleted = FALSE;
-- Firm-scoped filtering.
CREATE INDEX idx_engagement_letters_firm ON engagement_letters (firm_id) WHERE is_deleted = FALSE;
