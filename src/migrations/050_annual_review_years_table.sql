-- Table: annual_review_years
-- Purpose: generation ledger for the annual-review feature.
--
--          It records that a calendar year has been swept, which lets the code tell
--          "this year has not been generated yet" apart from "this year was
--          generated and legitimately produced zero rows". Without it, a year with
--          no eligible clients would be re-swept on every single page load.
--
--          The page-load safety net checks this table first: if the current year is
--          absent, it generates before returning the list. That is what makes
--          1 January correct even if the server was down when the weekly sweep was
--          due.
--
--          Not soft-deleted - this is bookkeeping, not a business record.

CREATE TABLE IF NOT EXISTS annual_review_years (
    -- The calendar year, e.g. 2026. Determined in Australian time, not UTC.
    year          INT PRIMARY KEY,

    -- When this year was first generated, and when it was last swept. The two
    -- differ once the weekly job has run again over the same year.
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_swept_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- How many review rows exist for this year, as of the last sweep. Purely
    -- informational - useful when checking whether a sweep did what was expected.
    client_count  INT NOT NULL DEFAULT 0
);
