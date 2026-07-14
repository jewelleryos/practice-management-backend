// Software — practice-wide master data (e.g. Xero, MYOB, QuickBooks).
// A flat name + description lookup row.
export interface Software {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CreateSoftwareRequest {
  name: string
  description?: string | null
}

export interface UpdateSoftwareRequest {
  name?: string
  description?: string | null
}

export interface SoftwareListResponse {
  items: Software[]
}
