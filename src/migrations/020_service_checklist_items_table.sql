-- Table: service_checklist_items
-- Purpose: Default checklist items for a service. Each item belongs to exactly
--          ONE service (from the Services master) and describes one thing to do
--          / collect when that service is delivered (e.g. for 'BAS Preparation':
--          'Bank statements', 'Payroll summary'). These are the DEFAULT items —
--          when a task is later created for a service, these are COPIED onto the
--          task (copied, not linked, so editing the master never rewrites history).
--
--          Each item carries a heading, an optional description, and an
--          is_required flag (drives the "Required" badge). sort_order controls the
--          display order within a service.
--
--          Soft-delete columns are present for forward-compatibility, but there
--          is NO delete flow yet (deferred, like the other masters; see root
--          CLAUDE.md).

CREATE TABLE IF NOT EXISTS service_checklist_items (
    id TEXT PRIMARY KEY DEFAULT generate_ulid(),

    -- The service this checklist item belongs to (fixed at creation).
    service_id TEXT NOT NULL REFERENCES services(id),

    heading VARCHAR(200) NOT NULL,
    description TEXT,

    -- Whether the item is mandatory (shown as a "Required" badge).
    is_required BOOLEAN NOT NULL DEFAULT FALSE,

    -- Active/inactive toggle (distinct from soft-delete): an admin can deactivate
    -- an item to retire it from new tasks without deleting it, and reactivate it
    -- later. Inactive items still show in the admin list (badged), just switched off.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Display order within the service. Lower shows first; ties break by heading.
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Soft delete (finance app — records are retained, never hard-deleted).
    -- deleted_by is the member id who deleted it (plain TEXT, no FK).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_service_checklist_items_service
    ON service_checklist_items (service_id) WHERE is_deleted = FALSE;

-- No duplicate headings within a service (case-insensitive).
CREATE UNIQUE INDEX idx_service_checklist_items_heading_unique
    ON service_checklist_items (service_id, LOWER(heading))
    WHERE is_deleted = FALSE;

-- Trigger: Auto-update updated_at
CREATE TRIGGER set_updated_at_service_checklist_items
    BEFORE UPDATE ON service_checklist_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
