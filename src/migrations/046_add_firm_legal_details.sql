-- Migration: add legal-name details to firms
-- Purpose: capture a tax-practice firm's registered legal names — the legal
-- company name, legal trust name, and legal firm name. Used on the engagement
-- letter (the legal firm name fills the "<Firm's name>" placeholder in the
-- Consumer Data Right clause).
--
-- Required at the APP layer (Zod) for tax_practice firms and left optional for
-- mortgage firms, so the rule lives in one place rather than a DB CHECK. Nullable
-- + additive so this runs cleanly on the already-populated firms table; existing
-- rows keep NULL and get filled the next time each firm is edited (mirrors the
-- approach in migration 045_add_tax_client_email.sql).

ALTER TABLE firms
    ADD COLUMN legal_company_name VARCHAR(160),
    ADD COLUMN legal_trust_name   VARCHAR(160),
    ADD COLUMN legal_firm_name    VARCHAR(160);
