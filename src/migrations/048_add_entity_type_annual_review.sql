-- Migration: add the per-entity-type annual-review switch.
--
-- Decides which clients get an ASIC annual review row generated for them. In
-- Australia a registered company receives an annual statement from ASIC on the
-- anniversary of its registration date; the firm tracks that on the client's behalf.
-- Not every entity type has that obligation, so the firm chooses which ones do.
--
-- Defaults to FALSE so EVERY existing entity type keeps behaving exactly as it does
-- today. The whole feature stays dormant until someone ticks a box in Settings.

ALTER TABLE entity_types
    ADD COLUMN annual_review_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN entity_types.annual_review_enabled IS
    'When true, active clients of this entity type with an incorporation date on file get one annual review row per calendar year.';
