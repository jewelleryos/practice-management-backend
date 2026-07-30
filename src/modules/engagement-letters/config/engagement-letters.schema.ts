import { z } from 'zod'

// Create a letter. The template version and letter-head version are decided by the
// system (latest of each), not sent by the client — so the payload is just the
// parameter values. `params` is a free-form object validated per-template later;
// for now it defaults to empty (v1 exposes no parameters yet).
export const createEngagementLetterSchema = z.object({
  params: z.record(z.unknown()).optional().default({}),
})

// Add a free-text note to a letter.
export const addEngagementLetterNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000, 'Note is too long'),
})

export type CreateEngagementLetterInput = z.infer<typeof createEngagementLetterSchema>
export type AddEngagementLetterNoteInput = z.infer<typeof addEngagementLetterNoteSchema>
