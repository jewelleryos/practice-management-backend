import type { DepartmentCode } from '../../../config/departments.constants'

// A concern person attached to a firm (agent/contact with regulatory ids).
// Stored/returned shape — optional fields are normalized to explicit null.
export interface ConcernPerson {
  name: string
  designation: string | null
  membership_number: string | null
  tax_agent_number: string | null
  asic_agent_id: string | null
}

// Input shape (from the validated request) — optional fields may be absent.
export interface ConcernPersonInput {
  name: string
  designation?: string | null
  membership_number?: string | null
  tax_agent_number?: string | null
  asic_agent_id?: string | null
}

// A firm — master data. Belongs to exactly one department (fixed at creation).
export interface Firm {
  id: string
  department: DepartmentCode
  name: string
  description: string | null
  address: string | null
  email: string | null
  contact_no: string | null
  concern_persons: ConcernPerson[]
  is_active: boolean
  created_at: string
  updated_at: string
}

// List row — the firm plus how many (non-deleted) members can access it.
export interface FirmListItem extends Firm {
  member_count: number
}

export interface CreateFirmRequest {
  department: DepartmentCode
  name: string
  description?: string | null
  address?: string | null
  email?: string | null
  contact_no?: string | null
  concern_persons: ConcernPersonInput[]
  is_active: boolean
}

// Department is immutable after creation, so it isn't updatable here.
export interface UpdateFirmRequest {
  name?: string
  description?: string | null
  address?: string | null
  email?: string | null
  contact_no?: string | null
  concern_persons?: ConcernPersonInput[]
  is_active?: boolean
}

export interface FirmListResponse {
  items: FirmListItem[]
}
