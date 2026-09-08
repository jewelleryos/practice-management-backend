import { z } from 'zod'

// Multi-value query filters are encoded as ONE comma-separated parameter:
//   ?entity_type_id=01H2X…,01H2Y…&status=active,inactive
//
// Repeated parameters (?id=a&id=b) were rejected deliberately: every route parses
// c.req.query(), which returns a FLAT object and keeps only the first value of a
// repeated key. Comma-separated keeps that flat parse, so no route changes - and
// a single value (?status=active) is simply a one-member list, which is why every
// URL bookmarked before this change still works.
//
// Safe because the values are ULIDs and fixed enum codes - a comma can never
// appear inside one. Do NOT add an escaping scheme.

// A hand-built URL must not be able to ask for ten thousand ids.
const MAX_FILTER_MEMBERS = 100

/**
 * Build the schema for one comma-separated multi-value filter.
 *
 * `member` is the schema for a SINGLE value, so enum filters stay as strict as
 * they are today - csvOf(statusEnum) still rejects a junk status.
 *
 * Absent, '', or a string of only separators all parse to `undefined`, which
 * every service already reads as "no filter" - so no service needs a new branch
 * for the empty case.
 *
 * The result is typed `z.output<T>[]`, NOT `string[]`, so an enum member keeps its
 * narrowing: csvOf(statusEnum) yields ('active' | 'inactive')[] and a service that
 * mixes up two filters still fails to compile.
 */
export function csvOf<T extends z.ZodType<string, z.ZodTypeDef, unknown>>(member: T) {
  return z
    .string()
    .optional()
    .transform((raw, ctx): z.output<T>[] | undefined => {
      // Split, trim, drop blanks, de-duplicate. "a,,b " and "a,b,a" both give ['a','b'].
      const parts = [
        ...new Set(
          (raw ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        ),
      ]

      if (parts.length === 0) return undefined

      if (parts.length > MAX_FILTER_MEMBERS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A filter cannot have more than ${MAX_FILTER_MEMBERS} values`,
        })
        return z.NEVER
      }

      const out: z.output<T>[] = []
      for (const part of parts) {
        const result = member.safeParse(part)
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${part}" is not a valid value for this filter`,
          })
          return z.NEVER
        }
        out.push(result.data)
      }
      return out
    })
}
