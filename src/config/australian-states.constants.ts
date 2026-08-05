// Australian states & territories — the FIXED set used for a client's address.
// Like service frequencies, these are not stored in the database; they are
// constants referenced wherever a state is captured/validated. The tax-client
// address `state` column stores one of these CODES; the frontend renders the
// dropdown from the mirrored list (final-frontend/src/features/tax-clients/constants.ts).

export const AUSTRALIAN_STATE_CODES = [
  'NSW',
  'VIC',
  'QLD',
  'SA',
  'WA',
  'TAS',
  'NT',
  'ACT',
] as const

export type AustralianStateCode = (typeof AUSTRALIAN_STATE_CODES)[number]

const AUSTRALIAN_STATE_LABELS: Record<AustralianStateCode, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
}

// Display list (code + human label).
export const AUSTRALIAN_STATE_LIST: { code: AustralianStateCode; label: string }[] =
  AUSTRALIAN_STATE_CODES.map((code) => ({ code, label: AUSTRALIAN_STATE_LABELS[code] }))

// Runtime guard — true if the given value is a valid Australian state code.
export function isAustralianStateCode(value: unknown): value is AustralianStateCode {
  return typeof value === 'string' && (AUSTRALIAN_STATE_CODES as readonly string[]).includes(value)
}

// Full state name for a code (e.g. 'NSW' → 'New South Wales'), or null. The tax
// client stores BOTH: the code in `state_code` and this derived name in `state`.
export function australianStateName(code: string | null | undefined): string | null {
  if (!code) return null
  return AUSTRALIAN_STATE_LABELS[code as AustralianStateCode] ?? null
}
