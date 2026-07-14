-- Table: member_sessions
-- Purpose: Stores active sessions for authentication. A row per active login
--          lets us invalidate sessions server-side (delete row = logout).
--          Sessions are intentionally HARD-deleted — removing the row is how a
--          logout / revocation works; keeping dead tokens would be a security hole.

CREATE TABLE IF NOT EXISTS member_sessions (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_member_sessions_member_id ON member_sessions(member_id);
CREATE INDEX idx_member_sessions_token ON member_sessions(token);
