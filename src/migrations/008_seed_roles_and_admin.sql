-- Seed: the four default roles + one bootstrap admin member.
--
-- Roles are ORDINARY records — fully editable and deletable later; nothing here
-- is locked. Their permission bundles reference codes from permissions.constants.ts:
--   Global:  MEMBER 101-105 · ROLE 201-204 · FIRM 301-304
--   Tax:     CLIENT 1001-1004      Mortgage: CLIENT 2001-2004
-- A role may carry both departments' permissions; each member only exercises the
-- ones for the departments they have access to.
--
-- The bootstrap member is the first account so someone can log in and create the
-- rest of the team. Password is bcrypt (cost 12); the plaintext is never stored.
--   Email:    beactparth@gmail.com
--   Password: Beact@2026   (change it after first login)
--   Role:     Partner/Director   ·   Departments: Tax Practice + Mortgage

-- 1. Default roles ----------------------------------------------------------
INSERT INTO roles (name, description, permissions) VALUES
    (
        'Partner/Director',
        'Top-level authority — full access across all modules and both departments.',
        ARRAY[101,102,103,104,105, 201,202,203,204, 301,302,303,304, 1001,1002,1003,1004, 2001,2002,2003,2004]
    ),
    (
        'Manager',
        'Manages team, firms and clients; can view roles.',
        ARRAY[101,102,103, 202, 301,302,303, 1001,1002,1003, 2001,2002,2003]
    ),
    (
        'Accountant/Bookkeeper',
        'Day-to-day client work across departments; can view team and firms.',
        ARRAY[102, 302, 1001,1002,1003,1004, 2001,2002,2003,2004]
    ),
    (
        'Admin/Support',
        'Runs Team Management and the admin panel — full member, role and firm access.',
        ARRAY[101,102,103,104,105, 201,202,203,204, 301,302,303,304, 1001,1002,1003,1004, 2001,2002,2003,2004]
    )
ON CONFLICT (name) DO NOTHING;

-- 2. Bootstrap admin member -------------------------------------------------
-- Full department access; no firm access is seeded (the admin creates firms and
-- assigns access from the app). Global modules (members/roles/firms) don't
-- require firm access.
INSERT INTO members (
    email,
    first_name,
    last_name,
    password,
    role_id,
    departments
) VALUES (
    'beactparth@gmail.com',
    'Parth',
    'Barochiya',
    '$2b$12$MbvVL6Uu6gYgm3xXImCNm.T2J7quI3vT316KyFq9AdntmEyYmxi3K',
    (SELECT id FROM roles WHERE name = 'Partner/Director'),
    ARRAY['tax_practice', 'mortgage']::text[]
) ON CONFLICT (email) DO NOTHING;
