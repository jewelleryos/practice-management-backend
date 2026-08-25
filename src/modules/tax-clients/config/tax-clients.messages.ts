export const taxClientMessages = {
  LIST_FETCHED: 'Clients fetched successfully',
  FETCHED: 'Client fetched successfully',
  CREATED: 'Client created successfully',
  UPDATED: 'Client updated successfully',
  NOT_FOUND: 'Client not found',
  OPTIONS_FETCHED: 'Client options fetched successfully',

  // Firm scoping
  FIRM_REQUIRED: 'Firm is required',
  FIRM_NOT_ACCESSIBLE: 'You do not have access to this firm',

  // Core fields
  NAME_REQUIRED: 'Client name is required',
  INVALID_STATUS: 'Status must be active or inactive',
  ENTITY_TYPE_NOT_FOUND: 'Selected entity type does not exist',
  CLIENT_GROUP_NOT_FOUND: 'Selected client group does not exist',
  SOFTWARE_NOT_FOUND: 'Selected software does not exist',
  ASSIGNEE_NOT_FOUND: 'Selected assignee is not a valid member',

  // Address
  INVALID_STATE: 'Selected state is not valid',
  INVALID_POSTCODE: 'Postcode must be 4 digits',

  // Contact
  INVALID_EMAIL: 'Email address is not valid',

  // Relationships
  RELATION_TYPE_NOT_FOUND: 'Selected relation type does not exist',
  RELATED_CLIENT_NOT_FOUND: 'A related client does not exist',
  RELATED_CLIENT_SELF: 'A client cannot be related to itself',

  // Services
  SERVICE_NOT_FOUND: 'A selected service does not exist',
  SERVICE_FREQUENCY_INVALID: 'Selected frequency is not available for that service',

  // Notes
  NOTE_TYPE_NOT_FOUND: 'A selected note type does not exist',
  NOTE_TEXT_REQUIRED: 'Note text is required',

  // Update — child reconciliation
  CHILD_NOT_FOUND: 'An item you edited no longer exists on this client',

  // ── CSV export / import ──
  // Every import error string lives here so the wording is in one place. The
  // functions take the offending value so a message always names it - "Software
  // "Xerox" does not exist" is actionable, "invalid software" is not.
  EXPORTED: 'Clients exported successfully',
  IMPORT_PREVIEW_READY: 'File checked',
  IMPORT_COMPLETED: 'Clients imported successfully',

  // File-level problems - reported once, with no row table.
  IMPORT_FILE_REQUIRED: 'Choose a CSV file to upload',
  IMPORT_FILE_NOT_CSV: 'The file must be a .csv file',
  IMPORT_FILE_TOO_LARGE: 'The file must be 2 MB or smaller',
  IMPORT_FILE_EMPTY: 'The file is empty',
  IMPORT_NO_ROWS: 'The file has a header row but no client rows',
  IMPORT_TOO_MANY_ROWS: (count: number, max: number) =>
    `The file has ${count} rows - the limit is ${max} per file. Split it and import again.`,
  IMPORT_MISSING_COLUMNS: (cols: string[]) => `Missing column(s): ${cols.join(', ')}`,
  IMPORT_UNKNOWN_COLUMNS: (cols: string[]) => `Unknown column(s): ${cols.join(', ')}`,
  IMPORT_DUPLICATE_COLUMNS: (cols: string[]) => `Column(s) appear more than once: ${cols.join(', ')}`,
  IMPORT_HAS_ERRORS: 'Fix the errors in the file and upload it again',
  IMPORT_MALFORMED_ROW: (detail: string) => `The file could not be read: ${detail}`,

  // Row-level problems.
  // More values than columns means a comma was left unescaped, so every value
  // after it is shifted - nothing else on the row can be trusted or reported.
  IMPORT_ROW_FIELD_COUNT: (found: number, expected: number) =>
    `This row has ${found} values but the file has ${expected} columns - a comma inside a value must be wrapped in "quotes"`,
  IMPORT_REQUIRED: (column: string) => `${column} is required`,
  IMPORT_MAX_LENGTH: (column: string, max: number) => `${column} must be ${max} characters or fewer`,
  IMPORT_UNKNOWN_FIRM: (v: string) =>
    `Firm "${v}" does not exist, or you do not have access to it`,
  IMPORT_UNKNOWN_ENTITY_TYPE: (v: string) => `Entity Type "${v}" does not exist`,
  IMPORT_UNKNOWN_SOFTWARE: (v: string) => `Software "${v}" does not exist`,
  IMPORT_INVALID_IS_COMPANY: (v: string) => `Is Company must be Yes or No, not "${v}"`,
  IMPORT_COMPANY_NAME_REQUIRED: 'Company Name is required when Is Company is Yes',
  IMPORT_COMPANY_NAME_NOT_ALLOWED: 'Company Name must be empty when Is Company is No',
  IMPORT_PERSON_NAME_REQUIRED: 'First Name and Last Name are required when Is Company is No',
  IMPORT_PERSON_NAME_NOT_ALLOWED:
    'First Name, Middle Name and Last Name must be empty when Is Company is Yes',
  IMPORT_NAME_TOO_LONG: 'First Name, Middle Name and Last Name together must be 200 characters or fewer',
  IMPORT_PERSON_ONLY: (column: string) => `${column} must be empty when Is Company is Yes`,
  IMPORT_INVALID_CHOICE: (column: string, v: string, allowed: readonly string[]) =>
    `${column} must be one of ${allowed.join(', ')} - not "${v}"`,
  IMPORT_INVALID_DATE: (v: string) =>
    `Date of Birth / Incorporation Date "${v}" is not a real date - use DD/MM/YYYY`,
  IMPORT_INVALID_POSTCODE: (v: string) => `Postcode "${v}" must be exactly 4 digits`,
  IMPORT_INVALID_EMAIL: (v: string) => `Email "${v}" is not a valid email address`,
  // Excel silently rewrites a long number as 5.18248E+10. Storing that would be
  // worse than refusing it, so it is an error that names the cause.
  IMPORT_SCIENTIFIC_NOTATION: (column: string, v: string) =>
    `${column} reads "${v}" - Excel has turned the number into scientific notation. Format the column as Text and enter it again.`,
  IMPORT_DUPLICATE_IN_FILE: (name: string, firm: string) =>
    `"${name}" appears more than once in this file for firm ${firm}`,
  IMPORT_ALREADY_EXISTS: (name: string, firm: string) =>
    `"${name}" already exists in firm ${firm} - import only creates new clients`,
}
