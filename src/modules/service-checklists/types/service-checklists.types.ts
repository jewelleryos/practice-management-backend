// A default checklist item for a service — master data. Belongs to exactly one
// service (fixed at creation). Carries a heading, optional description, an
// is_required flag, and a sort_order for display within the service.
export interface ServiceChecklistItem {
  id: string
  service_id: string
  heading: string
  description: string | null
  is_required: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// A checklist item with its service's name/code joined — the shape the flat
// admin table renders (one row per item, across all services).
export interface ServiceChecklistItemWithService extends ServiceChecklistItem {
  service_name: string
  service_code: string
}

export interface CreateServiceChecklistItemRequest {
  service_id: string
  heading: string
  description?: string | null
  is_required?: boolean
  is_active?: boolean
}

// service_id is fixed at creation, so it is not editable here. sort_order is not
// set through the form yet (auto-assigned on create); a reorder flow adds it later.
// is_active is toggled here too (the table's deactivate / reactivate action).
export interface UpdateServiceChecklistItemRequest {
  heading?: string
  description?: string | null
  is_required?: boolean
  is_active?: boolean
}

export interface ServiceChecklistListResponse {
  items: ServiceChecklistItemWithService[]
}
