-- Function: update_updated_at_column
-- Purpose: Automatically update the updated_at timestamp on row modification
-- Usage: Called by trigger before UPDATE on tables with updated_at column

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
