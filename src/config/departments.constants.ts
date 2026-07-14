// Departments — the two FIXED business divisions of the practice. These are not
// stored in the database; they are constants referenced directly wherever a
// department is needed (firms belong to one, members are granted access to some,
// and department-scoped permissions are tagged with one — see
// permissions.constants.ts).

export const DEPARTMENTS = {
  TAX_PRACTICE: 'tax_practice',
  MORTGAGE: 'mortgage',
} as const

export type DepartmentCode = (typeof DEPARTMENTS)[keyof typeof DEPARTMENTS]

// Display list (code + human label) — the frontend renders department pickers
// and switchers from this.
export const DEPARTMENT_LIST: { code: DepartmentCode; label: string }[] = [
  { code: DEPARTMENTS.TAX_PRACTICE, label: 'Tax Practice' },
  { code: DEPARTMENTS.MORTGAGE, label: 'Mortgage' },
]

export const ALL_DEPARTMENT_CODES: DepartmentCode[] = DEPARTMENT_LIST.map((d) => d.code)

// Runtime guard — true if the given value is a valid department code.
export function isDepartmentCode(value: unknown): value is DepartmentCode {
  return typeof value === 'string' && (ALL_DEPARTMENT_CODES as string[]).includes(value)
}
