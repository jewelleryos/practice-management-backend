-- Migration: add email to tax_clients
-- Purpose: Capture the Tax Practice client's contact email. Used by the
--          engagement letter's addressee block (client name / address / email)
--          and shown on the client detail page. Because a "related person" is
--          itself a tax_clients row, this one column also supplies the email for
--          a company client's chosen related person.
--
--          Tax clients only — the Mortgage client table is untouched. Nullable
--          and additive, matching the other identity/contact fields on
--          tax_clients (address was added the same way in migration 043).
--          Format is validated in the service (Zod), not by a DB CHECK, so the
--          rule lives in one place. Existing rows keep NULL.

ALTER TABLE tax_clients
    ADD COLUMN email VARCHAR(255);
