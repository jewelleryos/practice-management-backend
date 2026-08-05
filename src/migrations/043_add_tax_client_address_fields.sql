-- Migration: add address fields to tax_clients
-- Purpose: Capture the Tax Practice client's postal address (used by the
--          engagement letter and shown on the client detail page). Tax clients
--          only — the Mortgage client table is untouched.
--
--          All columns are OPTIONAL (nullable), matching the other identity
--          fields on tax_clients. The state is stored as BOTH its full name
--          (`state`, e.g. 'New South Wales') and its short code (`state_code`,
--          e.g. 'NSW') — the code is the fixed AU set
--          (NSW/VIC/QLD/SA/WA/TAS/NT/ACT — see
--          backend/src/config/australian-states.constants.ts) and the name is
--          derived from it in the service. `postcode` is a 4-digit AU postcode.
--          The code + postcode are validated in the service (Zod), not by a DB
--          CHECK, to keep the fixed sets in one place (the constants file).
--
--          Additive only: no backfill, existing rows keep NULLs.

ALTER TABLE tax_clients
    ADD COLUMN address_line VARCHAR(255),
    ADD COLUMN locality     VARCHAR(120),
    ADD COLUMN state        VARCHAR(60),
    ADD COLUMN state_code   VARCHAR(10),
    ADD COLUMN postcode     VARCHAR(12);
