-- Table: member_firms
-- Purpose: Firm access for a member (many-to-many relation). A member sees data
--          for the firms listed here, within the departments they have access to.
--          This is a pure relation table — revoking access removes the row.
--          Access-change history is captured later by the activity module.

CREATE TABLE IF NOT EXISTS member_firms (
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (member_id, firm_id)
);

-- Indexes
CREATE INDEX idx_member_firms_firm_id ON member_firms(firm_id);
