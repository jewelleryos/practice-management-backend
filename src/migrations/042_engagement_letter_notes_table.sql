-- Table: engagement_letter_notes
-- Purpose: Free-text comments attached to an engagement letter — a running log for
--          information/context. A letter can have MANY. A separate table (not an
--          embedded JSONB field) because notes grow unbounded and are appended over
--          time — same reasoning as the task notes tables.
--
--          These are PLAIN free-text comments: there is NO note type and NO
--          sensitive flag (unlike client notes). Add-only for now — editing and
--          deleting notes is deferred (soft-delete columns are present so a delete
--          flow drops in cleanly later).
--
--          Access follows the letter: anyone with TAX_CLIENT.MANAGE_ENGAGEMENT_LETTERS
--          (and access to the letter's firm) can read and add notes.

CREATE TABLE IF NOT EXISTS engagement_letter_notes (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The letter this note belongs to.
    engagement_letter_id TEXT NOT NULL REFERENCES engagement_letters(id),

    -- The note text.
    body TEXT NOT NULL,

    -- Member who wrote the note.
    created_by TEXT NOT NULL REFERENCES members(id),

    -- Soft delete (retained; edit/delete flow deferred).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps (UTC).
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All live notes for a letter, newest first (the common read).
CREATE INDEX idx_engagement_letter_notes_letter ON engagement_letter_notes (engagement_letter_id) WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at.
CREATE TRIGGER set_updated_at_engagement_letter_notes
    BEFORE UPDATE ON engagement_letter_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
