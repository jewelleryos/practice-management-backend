// A note type — practice-wide master data for the client Notes & Decision Log
// (e.g. General, Phone Call, Decision). `is_sensitive` marks notes of this type
// as sensitive.
export interface NoteType {
  id: string
  name: string
  description: string | null
  is_sensitive: boolean
  created_at: string
  updated_at: string
}

export interface CreateNoteTypeRequest {
  name: string
  description?: string | null
  is_sensitive: boolean
}

export interface UpdateNoteTypeRequest {
  name?: string
  description?: string | null
  is_sensitive?: boolean
}

export interface NoteTypeListResponse {
  items: NoteType[]
}
