-- =============================================================================
-- SEED: Tax-practice demo data (master data + ~55 clients + child rows)
-- =============================================================================
-- Purpose: fill the database with realistic tax-practice data so the Clients
--          list, filters, detail view, relationships, services and notes can be
--          exercised end to end.
--
-- What it does, in order (all idempotent except the client rows themselves):
--   1. Ensures master data exists (entity types, client groups, software,
--      relation types, services, note types, financial years) — inserts only
--      the rows that are missing (case-insensitive name match, non-deleted).
--      One service ("Ad-hoc / One-Time Task") is auto_added = TRUE, so it is
--      attached to every client below (as the app does on client creation).
--   2. Ensures the FIRMS exist — TAA, TCA (tax_practice) and Core Wealth (mortgage).
--   3. Grants each member access to every firm in the department(s) they belong to
--      (member_firms) — without this the firm-scoped Clients list is empty.
--   4. Inserts ~55 tax clients spread across firms / entity types / groups /
--      software / assignees / statuses, each with 1-3 random services PLUS the
--      auto-added one-time service, 0-2 notes, and ~25 inter-client relationships.
--
-- SAFE TO READ, RUN ONCE. Re-running is guarded: master data + firms +
-- member_firms won't duplicate, and the client block SKIPS itself if there are
-- already >= 50 non-deleted tax clients (so you won't accidentally add 110).
--
-- HOW TO RUN: open in pgAdmin (Query Tool) against this database and Execute,
--             or:  psql "<DATABASE_URL>" -f backend/seeds/001_seed_tax_clients.sql
-- =============================================================================

BEGIN;

-- 1. MASTER DATA --------------------------------------------------------------

-- Entity types
INSERT INTO entity_types (name, description)
SELECT v.name, v.description
FROM (VALUES
    ('Individual',              'A natural person'),
    ('Company',                 'A registered company (Pty Ltd)'),
    ('Trust',                   'Discretionary or unit trust'),
    ('Partnership',             'Two or more partners'),
    ('Self-Managed Super Fund', 'SMSF'),
    ('Sole Trader',             'Individual running a business')
) AS v(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM entity_types e
    WHERE LOWER(e.name) = LOWER(v.name) AND e.is_deleted = FALSE
);

-- Client groups
INSERT INTO client_groups (name, description)
SELECT v.name, v.description
FROM (VALUES
    ('Smith Family Group',    'Smith family related entities'),
    ('Nguyen Family Group',   'Nguyen family related entities'),
    ('Patel Family Group',    'Patel family related entities'),
    ('Harbour Corporate Group','Corporate group under Harbour holdings'),
    ('Standalone',            'Clients not part of any group')
) AS v(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM client_groups c
    WHERE LOWER(c.name) = LOWER(v.name) AND c.is_deleted = FALSE
);

-- Software
INSERT INTO software (name, description)
SELECT v.name, v.description
FROM (VALUES
    ('Xero',              'Cloud accounting'),
    ('MYOB',              'MYOB accounting'),
    ('QuickBooks Online', 'Intuit QBO'),
    ('Reckon',            'Reckon accounts'),
    ('Sage',              'Sage accounting'),
    ('Manual / Cash',     'No software — manual records')
) AS v(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM software s
    WHERE LOWER(s.name) = LOWER(v.name) AND s.is_deleted = FALSE
);

-- Relation types
INSERT INTO relation_types (name, description)
SELECT v.name, v.description
FROM (VALUES
    ('Director of',       'Is a director of'),
    ('Shareholder of',    'Holds shares in'),
    ('Spouse of',         'Married / de-facto partner of'),
    ('Trustee of',        'Acts as trustee of'),
    ('Beneficiary of',    'Is a beneficiary of'),
    ('Partner of',        'Is a partner of'),
    ('Parent company of', 'Is the parent company of')
) AS v(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM relation_types r
    WHERE LOWER(r.name) = LOWER(v.name) AND r.is_deleted = FALSE
);

-- Services (tax_practice)
-- The last row is the ONE-TIME / ad-hoc service: frequency 'one_time' and
-- auto_added = TRUE, so it is attached to every client automatically (below) and
-- lets the team raise one-off, non-recurring tasks. All others are auto_added = FALSE.
INSERT INTO services (department, name, code, description, frequencies, auto_added)
SELECT 'tax_practice', v.name, v.code, v.description, v.freqs, v.auto_added
FROM (VALUES
    ('Individual Tax Return', 'ITR',  'Annual individual income tax return', ARRAY['yearly']::text[],                        FALSE),
    ('Company Tax Return',    'CTR',  'Annual company income tax return',    ARRAY['yearly']::text[],                        FALSE),
    ('Trust Tax Return',      'TTR',  'Annual trust income tax return',      ARRAY['yearly']::text[],                        FALSE),
    ('BAS Preparation',       'BAS',  'Business Activity Statement',         ARRAY['quarterly']::text[],                     FALSE),
    ('Bookkeeping',           'BOOK', 'Ongoing bookkeeping',                 ARRAY['weekly','fortnightly','quarterly']::text[], FALSE),
    ('Payroll',               'PAY',  'Payroll processing',                  ARRAY['weekly','fortnightly']::text[],          FALSE),
    ('SMSF Annual Return',    'SMSF', 'Self-managed super fund return',      ARRAY['yearly']::text[],                        FALSE),
    ('FBT Return',            'FBT',  'Fringe benefits tax return',          ARRAY['yearly']::text[],                        FALSE),
    ('Financial Statements',  'FS',   'Annual financial statements',         ARRAY['yearly']::text[],                        FALSE),
    ('Ad-hoc / One-Time Task','ADHOC','One-off, non-recurring work',         ARRAY['one_time']::text[],                      TRUE)
) AS v(name, code, description, freqs, auto_added)
WHERE NOT EXISTS (
    SELECT 1 FROM services s
    WHERE s.department = 'tax_practice' AND LOWER(s.name) = LOWER(v.name) AND s.is_deleted = FALSE
);

-- Note types (two flagged sensitive so VIEW_SENSITIVE_NOTES gating can be tested)
INSERT INTO note_types (name, description, is_sensitive)
SELECT v.name, v.description, v.is_sensitive
FROM (VALUES
    ('General',            'General note',                FALSE),
    ('Phone Call',         'Record of a phone call',      FALSE),
    ('Email',              'Record of an email',          FALSE),
    ('Meeting',            'Record of a meeting',         FALSE),
    ('Decision',           'A decision that was made',    FALSE),
    ('Sensitive - Fees',   'Fee / billing discussion',    TRUE),
    ('Sensitive - Personal','Sensitive personal matter',  TRUE)
) AS v(name, description, is_sensitive)
WHERE NOT EXISTS (
    SELECT 1 FROM note_types n
    WHERE LOWER(n.name) = LOWER(v.name) AND n.is_deleted = FALSE
);

-- Financial years (mark 2024-25 current only if nothing is current yet)
INSERT INTO financial_years (year, is_current)
SELECT v.year,
       v.is_current AND NOT EXISTS (
           SELECT 1 FROM financial_years f2 WHERE f2.is_current AND f2.is_deleted = FALSE
       )
FROM (VALUES
    ('2022-23', FALSE),
    ('2023-24', FALSE),
    ('2024-25', TRUE),
    ('2025-26', FALSE)
) AS v(year, is_current)
WHERE NOT EXISTS (
    SELECT 1 FROM financial_years f
    WHERE LOWER(f.year) = LOWER(v.year) AND f.is_deleted = FALSE
);

-- 2. FIRMS (tax_practice + mortgage) ------------------------------------------
--    Short name in `name`, full name in `description`. Contact fields blank.
INSERT INTO firms (department, name, description, address, email, contact_no, is_active)
SELECT v.department, v.name, v.description, NULL, NULL, NULL, TRUE
FROM (VALUES
    ('tax_practice', 'TAA',         'Tax Accounting Australia'),
    ('tax_practice', 'TCA',         'Tax Consultant Australia'),
    ('mortgage',     'Core Wealth', NULL)
) AS v(department, name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM firms f
    WHERE f.department = v.department AND LOWER(f.name) = LOWER(v.name) AND f.is_deleted = FALSE
);

-- 3. FIRM ACCESS: grant each member access to every firm in the department(s)
--    they belong to. (Without this, the firm-scoped Clients list is empty.)
INSERT INTO member_firms (member_id, firm_id)
SELECT m.id, f.id
FROM members m
JOIN firms f ON f.department = ANY(m.departments)
WHERE m.is_deleted = FALSE
  AND f.is_deleted = FALSE
  AND f.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM member_firms mf WHERE mf.member_id = m.id AND mf.firm_id = f.id
  );

-- 4. CLIENTS + CHILD ROWS -----------------------------------------------------
DO $$
DECLARE
    firm_ids   TEXT[];
    group_ids  TEXT[];
    soft_ids   TEXT[];
    note_ids   TEXT[];
    member_ids TEXT[];
    rel_ids    TEXT[];
    svc_ids    TEXT[];        -- selectable (non auto-added) services, for the random 1-3 picks
    auto_svc_ids TEXT[];      -- auto_added services (e.g. one-time), attached to EVERY client
    entity_ids TEXT[];

    et_individual TEXT;
    et_company    TEXT;
    et_trust      TEXT;
    et_smsf       TEXT;
    et_sole       TEXT;

    first_names TEXT[] := ARRAY['James','Olivia','William','Charlotte','Jack','Amelia','Noah','Isla','Thomas','Mia',
                                'Ethan','Grace','Lucas','Ava','Henry','Chloe','Liam','Zoe','Alexander','Ruby',
                                'Daniel','Sophie','Michael','Emily','Benjamin','Hannah','Samuel','Ella','Rahul','Priya',
                                'Wei','Ling','Ahmed','Fatima','Carlos','Maria'];
    last_names  TEXT[] := ARRAY['Smith','Nguyen','Patel','Jones','Williams','Brown','Wilson','Taylor','Lee','Chen',
                                'Singh','Kaur','Kumar','Wang','Zhang','Murphy','Kelly','Ryan','O''Brien','Walsh',
                                'Johnson','Thompson','White','Martin','Anderson','Robinson','Wright','Khan','Ali','Da Silva'];
    comp_base   TEXT[] := ARRAY['Harbour','Summit','Pinnacle','Meridian','Cascade','Sterling','Anchor','Beacon','Crest','Vantage',
                                'Blue Sky','Ironbark','Wattle','Coral','Redgum','Eucalypt','Southern','Northern','Coastal','Riverbend'];
    comp_word   TEXT[] := ARRAY['Consulting','Logistics','Property','Trading','Constructions','Digital','Health','Retail',
                                'Ventures','Capital','Freight','Foods','Engineering','Media','Solutions','Investments'];
    comp_suffix TEXT[] := ARRAY['Pty Ltd','Holdings Pty Ltd','Group Pty Ltd','Enterprises Pty Ltd','Family Trust','Unit Trust'];

    note_texts  TEXT[] := ARRAY[
        'Client called to discuss upcoming lodgement deadline.',
        'Emailed request for bank statements and receipts.',
        'Met client to review prior year financials.',
        'Decision: proceed with quarterly BAS lodgement going forward.',
        'Client confirmed change of registered address.',
        'Discussed cash flow and provisional tax estimates.',
        'Follow-up required on outstanding GST reconciliation.',
        'Client provided updated director details.',
        'Reviewed and approved annual financial statements.',
        'Client requested fee estimate for SMSF audit.'
    ];

    fn TEXT; ln TEXT; cname TEXT;
    is_comp BOOLEAN;
    v_client_id TEXT;
    v_entity TEXT;
    v_firm TEXT;
    v_gender TEXT;
    v_title TEXT;
    v_status TEXT;
    v_freq TEXT;
    v_svc TEXT;
    used_svcs TEXT[];
    created_clients TEXT[] := '{}';
    i INT; j INT; n_svc INT; n_notes INT; n_rel INT;
    a_id TEXT; b_id TEXT;
BEGIN
    -- Guard: don't bloat if already seeded.
    IF (SELECT COUNT(*) FROM tax_clients WHERE is_deleted = FALSE) >= 50 THEN
        RAISE NOTICE 'Tax clients already seeded (>= 50 rows). Skipping client insert.';
        RETURN;
    END IF;

    SELECT array_agg(id) INTO firm_ids   FROM firms          WHERE department = 'tax_practice' AND is_deleted = FALSE AND is_active = TRUE;
    SELECT array_agg(id) INTO entity_ids FROM entity_types   WHERE is_deleted = FALSE;
    SELECT array_agg(id) INTO group_ids  FROM client_groups  WHERE is_deleted = FALSE;
    SELECT array_agg(id) INTO soft_ids   FROM software        WHERE is_deleted = FALSE;
    SELECT array_agg(id) INTO note_ids   FROM note_types      WHERE is_deleted = FALSE;
    SELECT array_agg(id) INTO rel_ids    FROM relation_types  WHERE is_deleted = FALSE;
    SELECT array_agg(id) INTO svc_ids    FROM services        WHERE department = 'tax_practice' AND is_deleted = FALSE AND auto_added = FALSE;
    SELECT array_agg(id) INTO auto_svc_ids FROM services      WHERE department = 'tax_practice' AND is_deleted = FALSE AND auto_added = TRUE;
    SELECT array_agg(id) INTO member_ids FROM members         WHERE is_deleted = FALSE AND is_active = TRUE;

    IF firm_ids IS NULL OR array_length(firm_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No active tax_practice firms found — cannot seed clients.';
    END IF;
    IF svc_ids IS NULL OR array_length(svc_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No tax_practice services found — cannot seed client services.';
    END IF;

    SELECT id INTO et_individual FROM entity_types WHERE LOWER(name) = 'individual'              AND is_deleted = FALSE LIMIT 1;
    SELECT id INTO et_company    FROM entity_types WHERE LOWER(name) = 'company'                 AND is_deleted = FALSE LIMIT 1;
    SELECT id INTO et_trust      FROM entity_types WHERE LOWER(name) = 'trust'                   AND is_deleted = FALSE LIMIT 1;
    SELECT id INTO et_smsf       FROM entity_types WHERE LOWER(name) = 'self-managed super fund' AND is_deleted = FALSE LIMIT 1;
    SELECT id INTO et_sole       FROM entity_types WHERE LOWER(name) = 'sole trader'             AND is_deleted = FALSE LIMIT 1;

    FOR i IN 1..55 LOOP
        is_comp := random() < 0.42;
        v_firm  := firm_ids[1 + floor(random() * array_length(firm_ids, 1))::int];
        v_status := CASE WHEN random() < 0.2 THEN 'inactive' ELSE 'active' END;

        IF is_comp THEN
            cname := comp_base[1 + floor(random() * array_length(comp_base, 1))::int] || ' '
                  || comp_word[1 + floor(random() * array_length(comp_word, 1))::int] || ' '
                  || comp_suffix[1 + floor(random() * array_length(comp_suffix, 1))::int];
            -- Entity type: company / trust / smsf, weighted toward company.
            v_entity := COALESCE(
                CASE WHEN random() < 0.65 THEN et_company
                     WHEN random() < 0.5  THEN et_trust
                     ELSE et_smsf END,
                et_company,
                entity_ids[1 + floor(random() * array_length(entity_ids, 1))::int]);
            v_gender := NULL;
            v_title  := NULL;

            INSERT INTO tax_clients (
                firm_id, name, is_company, entity_type_id,
                dob_or_incorporation_date, abn, acn, trading_name,
                bank_account_name, bank_account_prefix, bank_account_number, director_id,
                client_group_id, software_id, assignee_id, status
            ) VALUES (
                v_firm, cname, TRUE, v_entity,
                DATE '2005-01-01' + (floor(random() * 6500))::int,
                lpad((floor(random() * 99999999999))::bigint::text, 11, '0'),
                lpad((floor(random() * 999999999))::bigint::text, 9, '0'),
                CASE WHEN random() < 0.4 THEN split_part(cname, ' ', 1) || ' ' || split_part(cname, ' ', 2) ELSE NULL END,
                cname,
                lpad((floor(random() * 999))::int::text, 3, '0'),
                lpad((floor(random() * 999999999))::bigint::text, 9, '0'),
                CASE WHEN random() < 0.5 THEN 'D' || lpad((floor(random() * 99999999))::bigint::text, 8, '0') ELSE NULL END,
                CASE WHEN random() < 0.85 THEN group_ids[1 + floor(random() * array_length(group_ids, 1))::int] ELSE NULL END,
                CASE WHEN random() < 0.9  THEN soft_ids[1 + floor(random() * array_length(soft_ids, 1))::int] ELSE NULL END,
                CASE WHEN random() < 0.85 THEN member_ids[1 + floor(random() * array_length(member_ids, 1))::int] ELSE NULL END,
                v_status
            ) RETURNING id INTO v_client_id;
        ELSE
            fn := first_names[1 + floor(random() * array_length(first_names, 1))::int];
            ln := last_names[1 + floor(random() * array_length(last_names, 1))::int];
            cname := fn || ' ' || ln;
            v_gender := CASE WHEN random() < 0.5 THEN 'male' ELSE 'female' END;
            v_title  := CASE WHEN v_gender = 'male' THEN 'Mr'
                             ELSE (ARRAY['Mrs','Ms','Miss'])[1 + floor(random() * 3)::int] END;
            -- Entity type: individual, or sole trader for a minority.
            v_entity := COALESCE(
                CASE WHEN random() < 0.75 THEN et_individual ELSE et_sole END,
                et_individual,
                entity_ids[1 + floor(random() * array_length(entity_ids, 1))::int]);

            INSERT INTO tax_clients (
                firm_id, name, is_company, gender, title, entity_type_id,
                dob_or_incorporation_date, abn,
                bank_account_name, bank_account_prefix, bank_account_number,
                client_group_id, software_id, assignee_id, status
            ) VALUES (
                v_firm, cname, FALSE, v_gender, v_title, v_entity,
                DATE '1955-01-01' + (floor(random() * 16000))::int,
                CASE WHEN random() < 0.3 THEN lpad((floor(random() * 99999999999))::bigint::text, 11, '0') ELSE NULL END,
                cname,
                lpad((floor(random() * 999))::int::text, 3, '0'),
                lpad((floor(random() * 999999999))::bigint::text, 9, '0'),
                CASE WHEN random() < 0.7  THEN group_ids[1 + floor(random() * array_length(group_ids, 1))::int] ELSE NULL END,
                CASE WHEN random() < 0.6  THEN soft_ids[1 + floor(random() * array_length(soft_ids, 1))::int] ELSE NULL END,
                CASE WHEN random() < 0.85 THEN member_ids[1 + floor(random() * array_length(member_ids, 1))::int] ELSE NULL END,
                v_status
            ) RETURNING id INTO v_client_id;
        END IF;

        created_clients := array_append(created_clients, v_client_id);

        -- Services: 1..3 distinct per client.
        n_svc := 1 + floor(random() * 3)::int;
        used_svcs := '{}';
        FOR j IN 1..n_svc LOOP
            v_svc := svc_ids[1 + floor(random() * array_length(svc_ids, 1))::int];
            CONTINUE WHEN v_svc = ANY(used_svcs);
            used_svcs := array_append(used_svcs, v_svc);
            SELECT COALESCE(frequencies[1 + floor(random() * GREATEST(array_length(frequencies, 1), 1))::int], 'yearly')
              INTO v_freq FROM services WHERE id = v_svc;
            INSERT INTO tax_client_services (client_id, service_id, frequency, short_description, assignee_id)
            VALUES (
                v_client_id, v_svc, v_freq,
                CASE WHEN random() < 0.6 THEN 'Recurring engagement' ELSE NULL END,
                CASE WHEN random() < 0.7 THEN member_ids[1 + floor(random() * array_length(member_ids, 1))::int] ELSE NULL END
            );
        END LOOP;

        -- Auto-added services (e.g. the one-time service): attached to EVERY client,
        -- at each service's first listed frequency (mirrors the app's auto-attach).
        IF auto_svc_ids IS NOT NULL AND array_length(auto_svc_ids, 1) IS NOT NULL THEN
            FOREACH v_svc IN ARRAY auto_svc_ids LOOP
                SELECT COALESCE(frequencies[1], 'one_time') INTO v_freq FROM services WHERE id = v_svc;
                INSERT INTO tax_client_services (client_id, service_id, frequency)
                VALUES (v_client_id, v_svc, v_freq);
            END LOOP;
        END IF;

        -- Notes: 0..2 per client.
        n_notes := floor(random() * 3)::int;
        FOR j IN 1..n_notes LOOP
            INSERT INTO tax_client_notes (client_id, note_type_id, text, created_by)
            VALUES (
                v_client_id,
                note_ids[1 + floor(random() * array_length(note_ids, 1))::int],
                note_texts[1 + floor(random() * array_length(note_texts, 1))::int],
                member_ids[1 + floor(random() * array_length(member_ids, 1))::int]
            );
        END LOOP;
    END LOOP;

    -- Relationships: ~25 between distinct created clients (skip self / dup pairs).
    IF rel_ids IS NOT NULL AND array_length(rel_ids, 1) IS NOT NULL
       AND array_length(created_clients, 1) >= 2 THEN
        n_rel := 25;
        FOR i IN 1..n_rel LOOP
            a_id := created_clients[1 + floor(random() * array_length(created_clients, 1))::int];
            b_id := created_clients[1 + floor(random() * array_length(created_clients, 1))::int];
            CONTINUE WHEN a_id = b_id;
            CONTINUE WHEN EXISTS (
                SELECT 1 FROM tax_client_relationships
                WHERE client_id = a_id AND related_client_id = b_id AND is_deleted = FALSE
            );
            INSERT INTO tax_client_relationships (client_id, relation_type_id, related_client_id)
            VALUES (a_id, rel_ids[1 + floor(random() * array_length(rel_ids, 1))::int], b_id);
        END LOOP;
    END IF;

    RAISE NOTICE 'Seed complete: % clients created.', array_length(created_clients, 1);
END $$;

COMMIT;
