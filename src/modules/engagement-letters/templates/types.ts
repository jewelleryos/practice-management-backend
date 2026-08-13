// Types for the versioned, in-CODE engagement-letter templates.
//
// A template version is hard-coded (never edited in place; a new version is a new
// module). Each version declares its own PARAMETER SET — this is why the parameter
// list is per-version and not fixed: v2 may add/remove/rename parameters, and an old
// letter still regenerates against the exact parameters its version declared.

// The kinds of parameter a template can expose. Drives the generate form later.
export type ParameterType =
  | 'text' // single-line text
  | 'multiline' // multi-line text
  | 'date' // calendar date (stored/rendered as the viewer sees fit)
  | 'number' // numeric value (e.g. a fee)
  | 'choice' // one of a fixed set (e.g. we/us/our vs I/me/my)
  | 'boolean' // a true/false toggle (e.g. "continue until further communication")
  | 'list' // a repeatable list of simple values (e.g. the services)
  | 'block' // an optional/repeatable rich block (e.g. an outsourcing clause)

// One parameter the template exposes.
export interface ParameterDef {
  key: string // token key used in params JSON, e.g. 'letter_date'
  label: string // human label for the form
  type: ParameterType
  required: boolean
  repeatable?: boolean // true for list/block-style parameters
}

// A single template version: its id, the parameters it declares, and a function
// that renders the letter BODY (inner HTML) from a set of parameter values.
export interface EngagementLetterTemplate {
  version: string // e.g. 'v1'
  parameters: ParameterDef[] // what this version exposes (may be empty while WIP)
  renderBody: (params: Record<string, unknown>) => string // → inner body HTML
}
