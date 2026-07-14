// An entity type — practice-wide master data (e.g. Individual, Company, Trust).
// A flat name + description lookup row.
export interface EntityType {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CreateEntityTypeRequest {
  name: string
  description?: string | null
}

export interface UpdateEntityTypeRequest {
  name?: string
  description?: string | null
}

export interface EntityTypeListResponse {
  items: EntityType[]
}
