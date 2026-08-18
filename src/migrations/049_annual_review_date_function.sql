-- Migration: the annual-review anniversary calculation.
--
-- Given a client's incorporation date and a target calendar year, returns that
-- year's review date - the same day and month, with the year replaced.
--
-- It lives in the database rather than in TypeScript so the service, the weekly
-- sweep and any future report all produce byte-identical dates, and so the one
-- awkward edge case is handled in exactly one place: a 29 February incorporation
-- clamps to 28 February in a non-leap year.
--
-- IMMUTABLE because the result depends only on its arguments - this lets Postgres
-- use it inside index expressions and constant-fold it in the generation query.

CREATE OR REPLACE FUNCTION annual_review_date(source_date DATE, target_year INT)
RETURNS DATE AS $$
DECLARE
    m        INT := EXTRACT(MONTH FROM source_date)::INT;
    d        INT := EXTRACT(DAY   FROM source_date)::INT;
    last_day INT;
BEGIN
    -- Last day of that month in the target year (28, 29, 30 or 31).
    last_day := EXTRACT(
        DAY FROM (make_date(target_year, m, 1) + INTERVAL '1 month' - INTERVAL '1 day')
    )::INT;

    RETURN make_date(target_year, m, LEAST(d, last_day));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION annual_review_date(DATE, INT) IS
    'Anniversary of source_date in target_year; 29 Feb clamps to 28 Feb in non-leap years.';
