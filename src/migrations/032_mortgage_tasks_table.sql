-- Mortgage service tasks — one task type, created standalone (client is free text,
-- NOT a client record). Belongs to one mortgage firm (firm_id, fixed at create) which
-- scopes visibility via member_firms. Status is a hardcoded enum (source of truth in
-- code: mortgage-task-statuses.constants.ts), pinned here with a CHECK.
CREATE TABLE IF NOT EXISTS mortgage_tasks (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    firm_id TEXT NOT NULL REFERENCES firms(id),  -- a mortgage firm; scopes visibility
    loan_type_id TEXT NOT NULL REFERENCES loan_types(id),
    client_name TEXT NOT NULL,                 -- free text, NOT a client reference
    financial_institution TEXT,                -- bank / lender, free text
    summary TEXT,                              -- short summary (textarea)
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started','ask_for_document','in_process','ready_for_disbursement','completed')),
    created_by TEXT NOT NULL REFERENCES members(id),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mortgage_tasks_not_deleted ON mortgage_tasks (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_mortgage_tasks_firm ON mortgage_tasks (firm_id);
CREATE INDEX idx_mortgage_tasks_loan_type ON mortgage_tasks (loan_type_id);
CREATE INDEX idx_mortgage_tasks_status ON mortgage_tasks (status);

CREATE TRIGGER set_updated_at_mortgage_tasks
    BEFORE UPDATE ON mortgage_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
