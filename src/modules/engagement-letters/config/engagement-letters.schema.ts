import { z } from 'zod'

// Create a letter. The template version and letter-head version are decided by the
// system (latest of each), not sent by the client. `params` is the free-form,
// per-template parameter values (validated per-version later).
export const createEngagementLetterSchema = z.object({
  params: z.record(z.unknown()).optional().default({}),
  // Who the letter is addressed to. A PERSON client addresses itself, so this is
  // omitted/null. A COMPANY client must pick one of its PERSON relations — this is
  // that relation's tax_client id. The backend resolves the name/address/email
  // server-side from this id (never trusts client-sent values) and freezes them
  // into the stored params.
  relative_id: z.string().trim().min(1).nullish(),
})

// Add a free-text note to a letter.
export const addEngagementLetterNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000, 'Note is too long'),
})

export type CreateEngagementLetterInput = z.infer<typeof createEngagementLetterSchema>
export type AddEngagementLetterNoteInput = z.infer<typeof addEngagementLetterNoteSchema>
