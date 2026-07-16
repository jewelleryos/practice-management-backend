-- Type of Loan — practice-wide master data (name + description). The mortgage
-- service task picks its loan type from this list. Mirrors client_groups (011).
-- No delete flow yet: soft-delete columns ship so the delete module drops in
-- cleanly later (see root CLAUDE.md).
CREATE TABLE IF NOT EXISTS loan_types (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    name VARCHAR(160) NOT NULL,
    description TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Name unique among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX idx_loan_types_name_unique ON loan_types (LOWER(name)) WHERE is_deleted = FALSE;
CREATE INDEX idx_loan_types_not_deleted ON loan_types (is_deleted) WHERE is_deleted = FALSE;

CREATE TRIGGER set_updated_at_loan_types
    BEFORE UPDATE ON loan_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
