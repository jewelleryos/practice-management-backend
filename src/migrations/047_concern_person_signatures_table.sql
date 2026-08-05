-- Migration 047: concern_person_signatures — signature images for firm concern
-- persons, stored as base64 (no object storage / bucket wired up yet).
--
-- Append-only + one ACTIVE signature per concern person: uploading a new signature
-- inserts a fresh row (is_active = TRUE) and flips the previous active row to FALSE
-- — old rows are NEVER removed. An engagement letter freezes the exact signature id
-- it used, so even after the signer changes their signature the letter still renders
-- the original (the row is always there). Soft-delete columns per project convention.
--
-- `concern_person_id` is the ULID assigned to a concern person inside the firm's
-- `concern_persons` JSONB (no real FK — concern persons are JSONB elements, not rows).
CREATE TABLE IF NOT EXISTS concern_person_signatures (
    id                TEXT PRIMARY KEY DEFAULT generate_ulid(),
    firm_id           TEXT NOT NULL REFERENCES firms(id),
    concern_person_id TEXT NOT NULL,                    -- concern person's JSONB id
    image_base64      TEXT NOT NULL,                    -- data URI: data:image/png;base64,…
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,    -- the current signature for this person
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at        TIMESTAMPTZ,
    deleted_by        TEXT REFERENCES members(id),
    created_by        TEXT NOT NULL REFERENCES members(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() -- UTC
);

-- At most one active, non-deleted signature per concern person.
CREATE UNIQUE INDEX uq_active_signature_per_person
    ON concern_person_signatures (concern_person_id)
    WHERE is_active AND NOT is_deleted;

-- Lookups of a concern person's signatures (and by-id fetch is the PK).
CREATE INDEX idx_concern_person_signatures_person
    ON concern_person_signatures (concern_person_id);
