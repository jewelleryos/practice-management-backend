// Types for the engagement-letters module (instances + notes).

// A row in a client's letters list (the Engagement letter tab).
export interface EngagementLetterListItem {
  id: string
  template_version: string
  created_at: string
  created_by_id: string
  created_by_name: string
}

export interface EngagementLetterListResponse {
  items: EngagementLetterListItem[]
}

// One letter with everything needed to regenerate it.
export interface EngagementLetterDetail {
  id: string
  client_id: string
  firm_id: string
  template_version: string
  letterhead_id: string
  params: Record<string, unknown>
  created_at: string
  created_by_id: string
  created_by_name: string
}

// A note on a letter.
export interface EngagementLetterNote {
  id: string
  body: string
  created_at: string
  created_by_id: string
  created_by_name: string
}

export interface EngagementLetterNotesResponse {
  items: EngagementLetterNote[]
}

// Latest template's parameter definitions (for the generate form).
export interface EngagementLetterTemplateInfo {
  version: string
  parameters: {
    key: string
    label: string
    type: string
    required: boolean
    repeatable?: boolean
  }[]
}

// Context the create screen needs before showing the form: whether the client's
// firm has a letter head (else "not configured yet"), plus the active template's
// version + parameter defs (so the frontend picks the matching fields component).
export interface EngagementLetterCreateContext {
  has_letterhead: boolean
  template: EngagementLetterTemplateInfo
}
