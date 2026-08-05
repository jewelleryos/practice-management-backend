import { z } from 'zod'
import { firmMessages } from './firms.messages'
import { ALL_DEPARTMENT_CODES, type DepartmentCode } from '../../../config/departments.constants'
import { isFooterImageKey } from '../../../config/letterhead-footer-images.constants'

const departmentEnum = z.enum(ALL_DEPARTMENT_CODES as [DepartmentCode, ...DepartmentCode[]], {
  errorMap: () => ({ message: firmMessages.INVALID_DEPARTMENT }),
})

// Optional free-text: trims, and treats an empty string as "not provided" (null).
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

// Optional email: empty → null, otherwise must be a valid, lower-cased address.
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().toLowerCase().email().nullish(),
)

const concernPersonSchema = z.object({
  // Echoed back for EXISTING persons so edits preserve the id (and their signature).
  // New persons omit it; the service mints one. signature_uploaded is server-managed
  // and intentionally NOT accepted here (unknown keys are stripped by z.object).
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1, 'Concern person name is required').max(120),
  designation: optionalText(120),
  membership_number: optionalText(80),
  tax_agent_number: optionalText(80),
  asic_agent_id: optionalText(80),
})

// ── Concern-person signature upload ──
// Accepted image types and hard size cap (500 KB) for a signature. Stored as a
// base64 data URI; validated here so the service can trust the payload.
const SIGNATURE_DATA_URI = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+=*)$/
const SIGNATURE_MAX_BYTES = 500 * 1024

export const uploadSignatureSchema = z.object({
  image_base64: z
    .string()
    .trim()
    .min(1, firmMessages.SIGNATURE_REQUIRED)
    .superRefine((value, ctx) => {
      const match = SIGNATURE_DATA_URI.exec(value)
      if (!match) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: firmMessages.SIGNATURE_INVALID_TYPE })
        return
      }
      // Decoded byte size from the base64 payload (after the comma).
      const bytes = Buffer.from(match[2], 'base64').length
      if (bytes > SIGNATURE_MAX_BYTES) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: firmMessages.SIGNATURE_TOO_LARGE })
      }
    }),
})

// Legal details (registered names). Stored nullable; REQUIRED at the app layer for
// tax-practice firms only (enforced by the superRefine below on create). The legal
// firm name later fills the engagement letter's "<Firm's name>" placeholder.
const LEGAL_REQUIRED: [key: 'legal_company_name' | 'legal_trust_name' | 'legal_firm_name', message: string][] = [
  ['legal_company_name', firmMessages.LEGAL_COMPANY_NAME_REQUIRED],
  ['legal_trust_name', firmMessages.LEGAL_TRUST_NAME_REQUIRED],
  ['legal_firm_name', firmMessages.LEGAL_FIRM_NAME_REQUIRED],
]

export const createFirmSchema = z
  .object({
    department: departmentEnum,
    name: z.string().trim().min(1, firmMessages.NAME_REQUIRED).max(160),
    legal_company_name: optionalText(160),
    legal_trust_name: optionalText(160),
    legal_firm_name: optionalText(160),
    description: optionalText(1000),
    address: optionalText(500),
    email: optionalEmail,
    contact_no: optionalText(25),
    concern_persons: z.array(concernPersonSchema).default([]),
    is_active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // Legal names are compulsory for tax-practice firms; optional for mortgage.
    if (data.department !== 'tax_practice') return
    for (const [key, message] of LEGAL_REQUIRED) {
      if (!data[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message })
    }
  })

export const updateFirmSchema = z.object({
  name: z.string().trim().min(1, firmMessages.NAME_REQUIRED).max(160).optional(),
  // Department is immutable, so we can't tell tax vs mortgage here — the "required
  // for tax firms" rule is enforced on the frontend; the drawer always sends these.
  legal_company_name: optionalText(160),
  legal_trust_name: optionalText(160),
  legal_firm_name: optionalText(160),
  description: optionalText(1000),
  address: optionalText(500),
  email: optionalEmail,
  contact_no: optionalText(25),
  concern_persons: z.array(concernPersonSchema).optional(),
  is_active: z.boolean().optional(),
})

// ── Letter head ──
// A top-row segment: empty string → null, so the stored snapshot is clean.
const topRowSegment = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v))
  .nullish()
  .transform((v) => v ?? null)

const letterheadHeaderSchema = z.object({
  top_row: z
    .object({
      left: topRowSegment,
      middle: topRowSegment,
      right: topRowSegment,
    })
    .default({ left: null, middle: null, right: null }),
  company_name: z.string().trim().min(1, 'Company name is required').max(200),
  // Blank lines are dropped so the stored snapshot has no empty rows.
  lines: z
    .array(z.string().trim().max(300))
    .max(50)
    .default([])
    .transform((arr) => arr.filter((l) => l !== '')),
})

// Footer = a single image. image_key is required (there is always one footer) and
// must be a known key from the footer-images config.
const letterheadFooterSchema = z.object({
  image_key: z
    .string()
    .trim()
    .min(1, 'A footer image is required')
    .max(100)
    .refine(isFooterImageKey, 'Unknown footer image'),
})

export const saveLetterheadSchema = z.object({
  content: z.object({
    header: letterheadHeaderSchema,
    footer: letterheadFooterSchema,
  }),
})
