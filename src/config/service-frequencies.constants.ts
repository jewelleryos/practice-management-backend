// Service frequencies — the FIXED set of cadences a service can be offered at.
// Like departments, these are not stored in the database; they are constants
// referenced wherever a frequency is needed. A service (master data) carries one
// or more of these, chosen by the admin when the service is created.

export const SERVICE_FREQUENCY_VALUES = [
  'yearly',
  'quarterly',
  'monthly',
  'fortnightly',
  'weekly',
  // Ad-hoc / non-recurring work: a single one-off task with no period. Kept last.
  'one_time',
] as const

export type ServiceFrequency = (typeof SERVICE_FREQUENCY_VALUES)[number]

const SERVICE_FREQUENCY_LABELS: Record<ServiceFrequency, string> = {
  yearly: 'Yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  fortnightly: 'Fortnightly',
  weekly: 'Weekly',
  one_time: 'One-time',
}

// Display list (code + human label) — the frontend renders the frequency picker
// from this.
export const SERVICE_FREQUENCY_LIST: { code: ServiceFrequency; label: string }[] =
  SERVICE_FREQUENCY_VALUES.map((code) => ({ code, label: SERVICE_FREQUENCY_LABELS[code] }))

export const ALL_SERVICE_FREQUENCIES: readonly ServiceFrequency[] = SERVICE_FREQUENCY_VALUES

// Runtime guard — true if the given value is a valid service frequency.
export function isServiceFrequency(value: unknown): value is ServiceFrequency {
  return typeof value === 'string' && (SERVICE_FREQUENCY_VALUES as readonly string[]).includes(value)
}
