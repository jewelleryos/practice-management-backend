-- Migration: 022_add_monthly_service_frequency
-- Purpose: Widen the fixed service-frequency set. The set was originally
--          yearly/quarterly/fortnightly/weekly (migrations 014 & 018); this adds
--          'monthly' (always intended) and 'one_time' (ad-hoc, non-recurring
--          work). This only WIDENS the two CHECK constraints — no existing rows
--          change, nothing is dropped from the allowed set — so it is safe and
--          non-destructive.
--
--          The canonical set now (descending cadence, one-time last):
--            yearly, quarterly, monthly, fortnightly, weekly, one_time
--          See src/config/service-frequencies.constants.ts (source of truth).

-- 1) services.frequencies[] — the array CHECK on the Services master (mig 014).
ALTER TABLE services
    DROP CONSTRAINT IF EXISTS chk_services_frequencies;

ALTER TABLE services
    ADD CONSTRAINT chk_services_frequencies
        CHECK (frequencies <@ ARRAY['yearly', 'quarterly', 'monthly', 'fortnightly', 'weekly', 'one_time']::TEXT[]);

-- 2) tax_client_services.frequency — the scalar CHECK on a client's linked
--    service (mig 018; inline unnamed constraint, auto-named by Postgres).
ALTER TABLE tax_client_services
    DROP CONSTRAINT IF EXISTS tax_client_services_frequency_check;

ALTER TABLE tax_client_services
    ADD CONSTRAINT tax_client_services_frequency_check
        CHECK (frequency IN ('yearly', 'quarterly', 'monthly', 'fortnightly', 'weekly', 'one_time'));
