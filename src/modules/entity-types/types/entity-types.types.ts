// An entity type — practice-wide master data (e.g. Individual, Company, Trust).
// A flat name + description lookup row.
export interface EntityType {
  id: string
  name: string
  description: string | null
  // When true, active clients of this entity type that have an incorporation date
  // get one annual review row per calendar year. Off by default.
  annual_review_enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateEntityTypeRequest {
  name: string
  description?: string | null
  annual_review_enabled?: boolean
}

export interface UpdateEntityTypeRequest {
  name?: string
  description?: string | null
  annual_review_enabled?: boolean
}

export interface EntityTypeListResponse {
  items: EntityType[]
}
