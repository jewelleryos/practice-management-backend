-- Migration: 026_services_auto_added
-- Purpose: Add an `auto_added` flag to the Services master. When a service is
--          flagged, it is attached to EVERY newly created tax client by default
--          (so e.g. a "One-time / Ad-hoc" service is present on every client with
--          no manual setup). Many services may carry the flag — it is a plain
--          boolean, not a single-default. Defaults to FALSE (opt-in per service).
--
--          This migration ONLY adds the column. The auto-attach logic (in the
--          tax-client create flow) is wired separately.

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS auto_added BOOLEAN NOT NULL DEFAULT FALSE;
