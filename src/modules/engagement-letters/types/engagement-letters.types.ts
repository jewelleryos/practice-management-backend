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
// One resolved person the letter can be addressed to — the client itself (person
// client) or one of its person relations (company client). Address is already
// composed into a display string (may be multi-line, '\n'-separated).
export interface EngagementLetterAddresseePerson {
  id: string
  name: string
  address: string
  email: string | null
}

// The addressee options the create screen needs:
// - person client → `self` is the client's own details; `relation_options` empty.
// - company client → `self` is null; `relation_options` are the client's PERSON
//   relations (is_company = false, any relation type, both directions) to choose
//   from. `needs_relation` is true when a company has no person relation yet (the
//   UI shows "add a relation first" and blocks generation).
export interface EngagementLetterAddressee {
  is_company: boolean
  self: EngagementLetterAddresseePerson | null
  relation_options: EngagementLetterAddresseePerson[]
  needs_relation: boolean
}

// One active tax-practice service the letter can list (id + display name).
export interface EngagementLetterServiceOption {
  id: string
  name: string
}

// The services block the create screen needs: `all` is every active tax-practice
// service (the checkbox list, alphabetical); `default_ids` are the services the
// client currently uses (pre-checked). Letter-only — selecting here never writes
// tax_client_services.
export interface EngagementLetterServices {
  all: EngagementLetterServiceOption[]
  default_ids: string[]
}

// The client's firm registered legal names — shown (read-only) on the create screen
// and later frozen into the letter for the "<Firm's name>" placeholder. Required for
// tax-practice firms, but a field may be null for firms created before this was added.
export interface EngagementLetterFirmLegal {
  legal_company_name: string | null
  legal_trust_name: string | null
  legal_firm_name: string | null
  // Firm contact details — shown (read-only) on the create screen and frozen into the
  // letter (the Privacy section references them). Both are required to generate a letter.
  email: string | null
  contact_no: string | null
}

// firm has a letter head (else "not configured yet"), the active template's
// version + parameter defs (so the frontend picks the matching fields component),
// the addressee block (client name / address / email + relation choices), the
// services block (all services + the client's current ones pre-checked), and the
// firm's legal names (displayed on the form).
export interface EngagementLetterCreateContext {
  has_letterhead: boolean
  template: EngagementLetterTemplateInfo
  addressee: EngagementLetterAddressee
  services: EngagementLetterServices
  firm: EngagementLetterFirmLegal
}
