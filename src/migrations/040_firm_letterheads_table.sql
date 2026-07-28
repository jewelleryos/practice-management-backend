-- Firm letter heads — versioned letter-head content for a firm (tax_practice only,
-- enforced in the service). ONE ROW PER VERSION: `content` is an immutable JSONB
-- snapshot; "editing" the letter head inserts a new version (version_no + 1) and
-- flips is_latest — existing rows are never updated. Engagement letters will later
-- reference an exact version by id, so versions are PERMANENT (no delete, no
-- soft-delete). There is no change log: history is just the ordered list of
-- snapshots, and the UI renders one version's preview at a time.
--
-- content shape (header only for now; footer added later, no migration needed):
--   { "header": { "top_row": { "left": .., "middle": .., "right": .. },
--                 "company_name": "..", "lines": ["..", ..] } }
CREATE TABLE IF NOT EXISTS firm_letterheads (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    firm_id TEXT NOT NULL REFERENCES firms(id),
    version_no INT NOT NULL,                       -- 1, 2, 3… monotonic per firm
    is_latest BOOLEAN NOT NULL DEFAULT TRUE,       -- exactly one TRUE per firm
    content JSONB NOT NULL DEFAULT '{}'::jsonb,     -- full snapshot of the letter head
    created_by TEXT NOT NULL REFERENCES members(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- UTC; no updated_at (immutable)
);

-- Exactly one latest version per firm.
CREATE UNIQUE INDEX uq_firm_letterheads_latest ON firm_letterheads (firm_id) WHERE is_latest = TRUE;
-- Monotonic version numbers per firm.
CREATE UNIQUE INDEX uq_firm_letterheads_version ON firm_letterheads (firm_id, version_no);
-- History listing, newest first.
CREATE INDEX idx_firm_letterheads_firm ON firm_letterheads (firm_id, version_no DESC);
