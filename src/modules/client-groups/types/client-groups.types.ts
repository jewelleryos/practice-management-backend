// A client group — practice-wide master data (e.g. Individual, Company, Trust).
// A flat name + description lookup row.
export interface ClientGroup {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CreateClientGroupRequest {
  name: string
  description?: string | null
}

export interface UpdateClientGroupRequest {
  name?: string
  description?: string | null
}

export interface ClientGroupListResponse {
  items: ClientGroup[]
}
