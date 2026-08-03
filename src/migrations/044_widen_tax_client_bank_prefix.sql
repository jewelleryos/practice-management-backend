-- Migration: widen tax_clients.bank_account_prefix from 3 to 6 chars
-- Purpose: The bank account number's first box now takes 6 characters (was 3);
--          the second box stays 9. Widening only — existing values remain valid,
--          no data loss.

ALTER TABLE tax_clients
    ALTER COLUMN bank_account_prefix TYPE VARCHAR(6);
