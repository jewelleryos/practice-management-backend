// A relation type — practice-wide master data (e.g. Individual, Company, Trust).
// A flat name + description lookup row.
export interface RelationType {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CreateRelationTypeRequest {
  name: string
  description?: string | null
}

export interface UpdateRelationTypeRequest {
  name?: string
  description?: string | null
}

export interface RelationTypeListResponse {
  items: RelationType[]
}
