-- Migration: add import_batch_id to tax_clients
-- Purpose: Stamp every client created by ONE CSV import with the same id, so a
--          mistaken import can be undone in a single statement:
--
--            UPDATE tax_clients SET is_deleted = TRUE, deleted_at = NOW()
--             WHERE import_batch_id = '<batch id from the import result>';
--
--          Nothing in application code reads this column - it exists purely as
--          that undo handle. Clients added through the Add client form leave it
--          NULL, which is how you tell the two apart.
--
--          Nullable, no default, no constraint, no backfill. In PostgreSQL this
--          is a catalog-only change: it rewrites no rows and touches no existing
--          data, so every existing client keeps working untouched.

ALTER TABLE tax_clients
    ADD COLUMN import_batch_id TEXT;
