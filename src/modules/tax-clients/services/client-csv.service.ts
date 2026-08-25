import Papa from 'papaparse'
import { db } from '../../../lib/db'
import { taxClientMessages as M } from '../config/tax-clients.messages'
import { csvImportClientSchema } from '../config/tax-clients.schema'
import {
  AUSTRALIAN_STATE_CODES,
  AUSTRALIAN_STATE_LIST,
} from '../../../config/australian-states.constants'
import type { AuthUser } from '../../../middleware/auth.middleware'
import type {
  ExportRow,
  ImportableClient,
  ImportPreview,
  ImportPreviewRow,
} from '../types/tax-clients.types'

// ─────────────────────────────────────────────────────────────────────────────
// Everything the client CSV knows: the column list, how a row is written out,
// and how a row is read back in and validated. It lives in ONE file on purpose -
// the frontend never parses a file, it uploads it and renders what this returns,
// so there is exactly one set of rules and one place to change them.
//
// Design + reasoning: docs/superpowers/specs/2026-08-20-client-csv-import-export-design.md
// ─────────────────────────────────────────────────────────────────────────────

// The 23 columns, in the order the Add client wizard asks for them: firm and
// entity type, then name and identity, then tax identifiers, address, and bank.
//
// The wizard's Classification section (Client Group, Client Assignee, Status) is
// deliberately NOT here. Those are how the practice organises clients internally,
// not facts a client can supply about themselves, so every imported client is
// created ungrouped, unassigned and Active and is classified in the app after.
export const CSV_COLUMNS = [
  'Firm',
  'Entity Type',
  'Software',
  'Is Company',
  'Company Name',
  'First Name',
  'Middle Name',
  'Last Name',
  'Title',
  'Gender',
  'Date of Birth / Incorporation Date',
  'Trading Name',
  'ABN',
  'ACN',
  'Director ID',
  'Address Line',
  'Location/Area',
  'State',
  'Postcode',
  'Email',
  'Bank Account Name',
  'Bank Account Prefix',
  'Bank Account Number',
] as const

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
export const IMPORT_MAX_ROWS = 500

// Fixed option sets, mirroring the Add client form (features/tax-clients/constants.ts).
const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Mx'] as const
const GENDERS = ['Male', 'Female', 'Other'] as const

// Truthy / falsy spellings accepted for "Is Company". Deliberately short: the
// point is to forgive capitalisation and a one-letter answer, not to guess.
const YES_VALUES = ['yes', 'y', 'true']
const NO_VALUES = ['no', 'n', 'false']

// Excel silently rewrites a long digit string (an ABN, a bank number) as
// 5.18248E+10. Matching this is how we refuse the damage instead of storing it.
const SCIENTIFIC_NOTATION = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/

// Deliberately permissive - the authority on email validity is the same Zod
// validator the Add client form uses (csvImportClientSchema). This exists only
// so the user gets "Email "x" is not a valid email address" naming their value,
// rather than a generic schema message.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Small pure helpers ──

const pad2 = (n: number) => String(n).padStart(2, '0')

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month - 1] ?? 0
}

// 'DD/MM/YYYY' (what the app displays) or 'YYYY-MM-DD' (what the API stores) →
// 'YYYY-MM-DD', or null when it is not a real calendar date (31/02/2020 is not).
// Parsed from the text parts and never through `new Date()`, which would shift
// the day in some timezones - a DOB / incorporation date is a calendar value
// (house rule 2).
export function parseCsvDate(value: string): string | null {
  let year: number
  let month: number
  let day: number

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    const au = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
    if (!au) return null
    day = Number(au[1])
    month = Number(au[2])
    year = Number(au[3])
  }

  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' for the export, from the text parts (house rule 2).
// Tolerates a full ISO string by taking the date part.
export function formatCsvDate(value: string | null): string {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

// Split a stored person `name` back into first / middle / last for the export.
// Mirrors splitPersonName in the frontend's tax-clients/constants.ts exactly, so
// export → import is a lossless round trip for every name in the live data.
export function splitPersonName(name: string): { first: string; middle: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', middle: '', last: '' }
  if (parts.length === 1) return { first: parts[0]!, middle: '', last: '' }
  if (parts.length === 2) return { first: parts[0]!, middle: '', last: parts[1]! }
  return { first: parts[0]!, last: parts[parts.length - 1]!, middle: parts.slice(1, -1).join(' ') }
}

// Quote a single CSV cell. Values are written VERBATIM: nothing is prefixed or
// rewritten, because an exported file must be re-importable unchanged.
function cell(value: string | null | undefined): string {
  const v = value ?? ''
  if (v === '') return ''
  if (/[",\r\n]/.test(v) || v !== v.trim()) return `"${v.replace(/"/g, '""')}"`
  return v
}

// ── Lookups ──

interface Lookups {
  // Lower-cased name → id, for the three master references the file can name.
  firms: Map<string, string>
  entityTypes: Map<string, string>
  software: Map<string, string>
  accessibleFirmIds: string[]
}

// The firms this member can import into: their granted firms in the Tax Practice
// department. This repeats taxClientService.accessibleFirmIds rather than
// importing it, to avoid a circular import (the routes wire the two services
// together) - the same trade-off annual-reviews.service already makes.
async function loadLookups(actingUser: AuthUser): Promise<Lookups> {
  const [firmRows, entityRows, softwareRows] = await Promise.all([
    db.query(
      `SELECT f.id, f.name
       FROM member_firms mf
       JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE AND f.department = 'tax_practice'
       WHERE mf.member_id = $1`,
      [actingUser.id],
    ),
    db.query(`SELECT id, name FROM entity_types WHERE is_deleted = FALSE`),
    db.query(`SELECT id, name FROM software WHERE is_deleted = FALSE`),
  ])

  const byName = (rows: { id: string; name: string }[]) => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.name.trim().toLowerCase(), r.id)
    return map
  }

  return {
    firms: byName(firmRows.rows),
    entityTypes: byName(entityRows.rows),
    software: byName(softwareRows.rows),
    accessibleFirmIds: firmRows.rows.map((r) => r.id as string),
  }
}

// ── Per-row field validation ──

// A trimmed optional text value: refuses Excel's scientific notation on the
// identifier columns, enforces the stored column's length, and returns null for
// an empty cell.
function optionalText(
  column: string,
  value: string,
  max: number,
  errors: string[],
  rejectScientific = false,
): string | null {
  if (!value) return null
  if (rejectScientific && SCIENTIFIC_NOTATION.test(value)) {
    errors.push(M.IMPORT_SCIENTIFIC_NOTATION(column, value))
    return null
  }
  if (value.length > max) {
    errors.push(M.IMPORT_MAX_LENGTH(column, max))
    return null
  }
  return value
}

// Match a value against a fixed option set, ignoring case, and return the
// canonical spelling so what is stored always looks like the form's own value.
function matchChoice(value: string, allowed: readonly string[]): string | undefined {
  const needle = value.trim().toLowerCase()
  return allowed.find((option) => option.toLowerCase() === needle)
}

// A state cell: the code (NSW) as the template asks for, or the full name (New
// South Wales) since an exported-then-edited file or a hand-typed one may carry
// either. Always resolved back to the CODE the client record stores.
function matchStateCode(value: string): string | undefined {
  const byCode = matchChoice(value, AUSTRALIAN_STATE_CODES)
  if (byCode) return byCode
  const needle = value.trim().toLowerCase()
  return AUSTRALIAN_STATE_LIST.find((s) => s.label.toLowerCase() === needle)?.code
}

interface RowOutcome {
  preview: ImportPreviewRow
  client: ImportableClient | null
  // Duplicate-detection key (firm id + lower-cased name), null when either is
  // missing or invalid - such a row already carries an error.
  dedupeKey: string | null
  firmName: string
}

function validateRow(
  rowNumber: number,
  cells: string[],
  columnIndex: Map<string, number>,
  lookups: Lookups,
): RowOutcome {
  const errors: string[] = []
  const get = (column: string) => (cells[columnIndex.get(column)!] ?? '').trim()

  // A row with MORE values than the file has columns means a comma was left
  // unescaped; the values after it are all shifted, so nothing below can be
  // trusted. Report that alone.
  if (cells.length > CSV_COLUMNS.length) {
    return {
      preview: {
        row_number: rowNumber,
        name: '',
        firm: '',
        entity_type: '',
        errors: [M.IMPORT_ROW_FIELD_COUNT(cells.length, CSV_COLUMNS.length)],
      },
      client: null,
      dedupeKey: null,
      firmName: '',
    }
  }

  // ── Firm, entity type, software ──
  const firmRaw = get('Firm')
  let firmId: string | null = null
  if (!firmRaw) {
    errors.push(M.IMPORT_REQUIRED('Firm'))
  } else {
    firmId = lookups.firms.get(firmRaw.toLowerCase()) ?? null
    // Unknown and inaccessible are one message on purpose: a member has no
    // business learning that a firm they cannot see exists.
    if (!firmId) errors.push(M.IMPORT_UNKNOWN_FIRM(firmRaw))
  }

  const entityRaw = get('Entity Type')
  let entityTypeId: string | null = null
  if (!entityRaw) {
    errors.push(M.IMPORT_REQUIRED('Entity Type'))
  } else {
    entityTypeId = lookups.entityTypes.get(entityRaw.toLowerCase()) ?? null
    if (!entityTypeId) errors.push(M.IMPORT_UNKNOWN_ENTITY_TYPE(entityRaw))
  }

  const softwareRaw = get('Software')
  let softwareId: string | null = null
  if (softwareRaw) {
    softwareId = lookups.software.get(softwareRaw.toLowerCase()) ?? null
    if (!softwareId) errors.push(M.IMPORT_UNKNOWN_SOFTWARE(softwareRaw))
  }

  // ── Person or company ──
  const isCompanyRaw = get('Is Company')
  let isCompany: boolean | null = null
  if (!isCompanyRaw) {
    errors.push(M.IMPORT_REQUIRED('Is Company'))
  } else if (YES_VALUES.includes(isCompanyRaw.toLowerCase())) {
    isCompany = true
  } else if (NO_VALUES.includes(isCompanyRaw.toLowerCase())) {
    isCompany = false
  } else {
    errors.push(M.IMPORT_INVALID_IS_COMPANY(isCompanyRaw))
  }

  // ── Name ──
  // The database stores one combined `name`, but the file keeps the form's four
  // separate boxes because the form's required rules are per box. The join here
  // is the same one the wizard does.
  const companyName = get('Company Name')
  const firstName = get('First Name')
  const middleName = get('Middle Name')
  const lastName = get('Last Name')
  const personName = [firstName, middleName, lastName].filter(Boolean).join(' ')

  let name = ''
  if (isCompany === true) {
    if (!companyName) errors.push(M.IMPORT_COMPANY_NAME_REQUIRED)
    if (personName) errors.push(M.IMPORT_PERSON_NAME_NOT_ALLOWED)
    if (companyName.length > 200) errors.push(M.IMPORT_MAX_LENGTH('Company Name', 200))
    name = companyName
  } else if (isCompany === false) {
    if (!firstName || !lastName) errors.push(M.IMPORT_PERSON_NAME_REQUIRED)
    if (companyName) errors.push(M.IMPORT_COMPANY_NAME_NOT_ALLOWED)
    if (personName.length > 200) errors.push(M.IMPORT_NAME_TOO_LONG)
    name = personName
  } else {
    // Is Company itself is wrong; still show the user something recognisable.
    name = companyName || personName
  }

  // ── Person-only descriptors ──
  const titleRaw = get('Title')
  let title: string | null = null
  if (titleRaw) {
    if (isCompany === true) {
      errors.push(M.IMPORT_PERSON_ONLY('Title'))
    } else {
      title = matchChoice(titleRaw, TITLES) ?? null
      if (!title) errors.push(M.IMPORT_INVALID_CHOICE('Title', titleRaw, TITLES))
    }
  }

  const genderRaw = get('Gender')
  let gender: string | null = null
  if (genderRaw) {
    if (isCompany === true) {
      errors.push(M.IMPORT_PERSON_ONLY('Gender'))
    } else {
      gender = matchChoice(genderRaw, GENDERS) ?? null
      if (!gender) errors.push(M.IMPORT_INVALID_CHOICE('Gender', genderRaw, GENDERS))
    }
  }

  // ── Key date ──
  const dateRaw = get('Date of Birth / Incorporation Date')
  let keyDate: string | null = null
  if (dateRaw) {
    keyDate = parseCsvDate(dateRaw)
    if (!keyDate) errors.push(M.IMPORT_INVALID_DATE(dateRaw))
  }

  // ── Identifiers. Trading Name, ABN, ACN and Director ID are NOT company-only:
  // the Add client form shows all four for a person too. ──
  const tradingName = optionalText('Trading Name', get('Trading Name'), 200, errors)
  const abn = optionalText('ABN', get('ABN'), 20, errors, true)
  const acn = optionalText('ACN', get('ACN'), 20, errors, true)
  const directorId = optionalText('Director ID', get('Director ID'), 50, errors, true)

  // ── Address ──
  const addressLine = optionalText('Address Line', get('Address Line'), 255, errors)
  const locality = optionalText('Location/Area', get('Location/Area'), 120, errors)

  const stateRaw = get('State')
  let stateCode: string | null = null
  if (stateRaw) {
    stateCode = matchStateCode(stateRaw) ?? null
    if (!stateCode) errors.push(M.IMPORT_INVALID_CHOICE('State', stateRaw, AUSTRALIAN_STATE_CODES))
  }

  const postcodeRaw = get('Postcode')
  let postcode: string | null = null
  if (postcodeRaw) {
    if (SCIENTIFIC_NOTATION.test(postcodeRaw)) {
      errors.push(M.IMPORT_SCIENTIFIC_NOTATION('Postcode', postcodeRaw))
    } else if (!/^\d{4}$/.test(postcodeRaw)) {
      errors.push(M.IMPORT_INVALID_POSTCODE(postcodeRaw))
    } else {
      postcode = postcodeRaw
    }
  }

  // ── Contact ──
  const emailRaw = get('Email')
  let email: string | null = null
  if (emailRaw) {
    if (emailRaw.length > 255) {
      errors.push(M.IMPORT_MAX_LENGTH('Email', 255))
    } else if (!EMAIL_SHAPE.test(emailRaw)) {
      errors.push(M.IMPORT_INVALID_EMAIL(emailRaw))
    } else {
      email = emailRaw.toLowerCase()
    }
  }

  // ── Bank ──
  const bankAccountName = optionalText('Bank Account Name', get('Bank Account Name'), 200, errors)
  const bankPrefix = optionalText('Bank Account Prefix', get('Bank Account Prefix'), 6, errors, true)
  const bankNumber = optionalText('Bank Account Number', get('Bank Account Number'), 9, errors, true)

  const preview: ImportPreviewRow = {
    row_number: rowNumber,
    name,
    firm: firmRaw,
    entity_type: entityRaw,
    errors,
  }

  if (errors.length > 0 || !firmId || !entityTypeId || !name) {
    // A row with no explicit error but no name still cannot be inserted; that
    // only happens when Is Company was unreadable, which already errored above.
    return { preview, client: null, dedupeKey: null, firmName: firmRaw }
  }

  const candidate: ImportableClient = {
    firm_id: firmId,
    name,
    is_company: isCompany === true,
    gender,
    title,
    entity_type_id: entityTypeId,
    software_id: softwareId,
    dob_or_incorporation_date: keyDate,
    abn,
    acn,
    trading_name: tradingName,
    address_line: addressLine,
    locality,
    state_code: stateCode,
    postcode,
    email,
    bank_account_name: bankAccountName,
    bank_account_prefix: bankPrefix,
    bank_account_number: bankNumber,
    director_id: directorId,
  }

  // Final gate: the same validators the Add client form runs through. If the two
  // ever drift, the row fails here rather than writing something the form would
  // have refused.
  const parsed = csvImportClientSchema.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.')
      errors.push(path ? `${path}: ${issue.message}` : issue.message)
    }
    return { preview, client: null, dedupeKey: null, firmName: firmRaw }
  }

  return {
    preview,
    client: candidate,
    dedupeKey: `${firmId}|${name.toLowerCase()}`,
    firmName: firmRaw,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const clientCsvService = {
  CSV_COLUMNS,

  // ── EXPORT ──
  // Header + one line per client, prefixed with a UTF-8 BOM so Excel reads
  // accented characters correctly. CRLF line endings, which is what every
  // spreadsheet writes.
  buildCsv(rows: ExportRow[]): string {
    const lines: string[] = [CSV_COLUMNS.map(cell).join(',')]

    for (const row of rows) {
      const person = row.is_company
        ? { first: '', middle: '', last: '' }
        : splitPersonName(row.name)

      lines.push(
        [
          row.firm_name,
          row.entity_type_name,
          row.software_name,
          row.is_company ? 'Yes' : 'No',
          row.is_company ? row.name : '',
          person.first,
          person.middle,
          person.last,
          row.title,
          row.gender,
          formatCsvDate(row.dob_or_incorporation_date),
          row.trading_name,
          row.abn,
          row.acn,
          row.director_id,
          row.address_line,
          row.locality,
          row.state_code,
          row.postcode,
          row.email,
          row.bank_account_name,
          row.bank_account_prefix,
          row.bank_account_number,
        ]
          .map(cell)
          .join(','),
      )
    }

    return `﻿${lines.join('\r\n')}\r\n`
  },

  // Filename for a download, built from the caller's own date parts. Only used
  // for the Content-Disposition header - CORS does not expose that header to the
  // browser, so the frontend builds the same name itself.
  exportFilename(now: Date): string {
    return `clients-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.csv`
  },

  // ── IMPORT ──
  // Parse, validate and build the preview. Writes NOTHING. Returns the preview
  // the user reviews plus the validated rows ready to insert - the commit path
  // calls this again from scratch rather than trusting a previous result.
  async parseAndValidate(
    actingUser: AuthUser,
    csvText: string,
  ): Promise<{ preview: ImportPreview; clients: ImportableClient[] }> {
    const empty = (fileError: string): { preview: ImportPreview; clients: ImportableClient[] } => ({
      preview: { file_errors: [fileError], rows: [], total_rows: 0, error_rows: 0, can_import: false },
      clients: [],
    })

    // Strip the UTF-8 BOM Excel writes, or the first header would read '﻿Firm'.
    const text = csvText.replace(/^﻿/, '')
    if (!text.trim()) return empty(M.IMPORT_FILE_EMPTY)

    const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: 'greedy' })
    // Papaparse reports quoting damage (an unterminated quote) as a parse error.
    // A file that cannot be read at all has no meaningful rows to show.
    const fatal = parsed.errors.find((e) => e.type === 'Quotes')
    if (fatal) return empty(M.IMPORT_MALFORMED_ROW(fatal.message))

    const table = parsed.data.filter((r) => Array.isArray(r))
    if (table.length === 0) return empty(M.IMPORT_FILE_EMPTY)

    // ── Header ──
    const header = (table[0] ?? []).map((h) => (h ?? '').trim())
    const fileErrors: string[] = []

    const seenHeaders = new Map<string, number>()
    for (const h of header) {
      if (!h) continue
      seenHeaders.set(h.toLowerCase(), (seenHeaders.get(h.toLowerCase()) ?? 0) + 1)
    }

    const duplicates = CSV_COLUMNS.filter((c) => (seenHeaders.get(c.toLowerCase()) ?? 0) > 1)
    if (duplicates.length) fileErrors.push(M.IMPORT_DUPLICATE_COLUMNS([...duplicates]))

    const missing = CSV_COLUMNS.filter((c) => !seenHeaders.has(c.toLowerCase()))
    if (missing.length) fileErrors.push(M.IMPORT_MISSING_COLUMNS([...missing]))

    const expected = new Set(CSV_COLUMNS.map((c) => c.toLowerCase()))
    const unknown = header.filter((h) => h && !expected.has(h.toLowerCase()))
    // Named explicitly so a file left over from the first draft - which carried
    // Client Group, Client Assignee Email and Status - fails loudly here rather
    // than being silently half-applied.
    if (unknown.length) fileErrors.push(M.IMPORT_UNKNOWN_COLUMNS(unknown))

    if (fileErrors.length) {
      return {
        preview: { file_errors: fileErrors, rows: [], total_rows: 0, error_rows: 0, can_import: false },
        clients: [],
      }
    }

    // Column order in the file does not matter - map each expected column to
    // wherever it actually sits.
    const columnIndex = new Map<string, number>()
    for (const column of CSV_COLUMNS) {
      columnIndex.set(
        column,
        header.findIndex((h) => h.toLowerCase() === column.toLowerCase()),
      )
    }

    // ── Rows ──
    const dataRows = table.slice(1)
    if (dataRows.length === 0) return empty(M.IMPORT_NO_ROWS)
    if (dataRows.length > IMPORT_MAX_ROWS) {
      return empty(M.IMPORT_TOO_MANY_ROWS(dataRows.length, IMPORT_MAX_ROWS))
    }

    const lookups = await loadLookups(actingUser)
    const outcomes = dataRows.map((cells, i) => validateRow(i + 1, cells, columnIndex, lookups))

    // ── Two rows in this file for the same name + firm ──
    // Errors land on BOTH rows: neither is more wrong than the other, and the
    // user needs to see both to decide which to keep.
    const byKey = new Map<string, RowOutcome[]>()
    for (const outcome of outcomes) {
      if (!outcome.dedupeKey) continue
      const bucket = byKey.get(outcome.dedupeKey) ?? []
      bucket.push(outcome)
      byKey.set(outcome.dedupeKey, bucket)
    }
    for (const bucket of byKey.values()) {
      if (bucket.length < 2) continue
      for (const outcome of bucket) {
        outcome.preview.errors.push(
          M.IMPORT_DUPLICATE_IN_FILE(outcome.preview.name, outcome.firmName),
        )
        outcome.client = null
      }
    }

    // ── A name that already exists in that firm ──
    // Since import only creates, this is what stops the same file being imported
    // twice and doubling the client list. One query for the whole file.
    const candidates = outcomes.filter((o) => o.client !== null)
    if (candidates.length > 0) {
      const existing = await db.query(
        `SELECT firm_id, LOWER(name) AS lname
         FROM tax_clients
         WHERE is_deleted = FALSE
           AND firm_id = ANY($1)
           AND LOWER(name) = ANY($2)`,
        [
          lookups.accessibleFirmIds,
          [...new Set(candidates.map((o) => o.client!.name.toLowerCase()))],
        ],
      )
      const taken = new Set(existing.rows.map((r) => `${r.firm_id}|${r.lname}`))
      for (const outcome of candidates) {
        const key = `${outcome.client!.firm_id}|${outcome.client!.name.toLowerCase()}`
        if (!taken.has(key)) continue
        outcome.preview.errors.push(
          M.IMPORT_ALREADY_EXISTS(outcome.preview.name, outcome.firmName),
        )
        outcome.client = null
      }
    }

    const rows = outcomes.map((o) => o.preview)
    const errorRows = rows.filter((r) => r.errors.length > 0).length

    return {
      preview: {
        file_errors: [],
        rows,
        total_rows: rows.length,
        error_rows: errorRows,
        // All or nothing: one bad row blocks the whole file. A partial import is
        // worse than none - the user would have to remember which rows went in,
        // and re-uploading the corrected file would duplicate them.
        can_import: errorRows === 0,
      },
      clients: outcomes.map((o) => o.client).filter((c): c is ImportableClient => c !== null),
    }
  },
}
