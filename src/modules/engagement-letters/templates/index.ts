// Registry of the hard-coded engagement-letter template versions.
//
// Old versions are NEVER removed — a letter pinned to 'v1' must always resolve, even
// after newer versions ship. New letters default to LATEST_VERSION.
import type { EngagementLetterTemplate } from './types'
import { templateV1 } from './v1'

// version id → template. Add new versions here; never delete an old one.
const TEMPLATES: Record<string, EngagementLetterTemplate> = {
  [templateV1.version]: templateV1,
}

// What a NEW letter is created with. Bump this when a newer version becomes the
// default; existing letters keep their own pinned version.
export const LATEST_VERSION = templateV1.version

// Resolve a template by version. Throws if unknown (e.g. a typo or a version that
// was wrongly removed) so the caller fails loudly rather than rendering nothing.
export function getTemplate(version: string): EngagementLetterTemplate {
  const tpl = TEMPLATES[version]
  if (!tpl) throw new Error(`Unknown engagement-letter template version: ${version}`)
  return tpl
}

export type { EngagementLetterTemplate, ParameterDef, ParameterType } from './types'
