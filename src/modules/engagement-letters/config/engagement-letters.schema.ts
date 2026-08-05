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
  // Which firm concern person signs the letter (their JSONB id). Required — the
  // backend snapshots the signer's name/designation and their ACTIVE signature id,
  // and refuses to generate if the chosen person has no signature.
  signer_concern_person_id: z.string().trim().min(1).nullish(),
  // Company clients only — the relationship ids of the person relations that
  // acknowledge the letter, in TICK ORDER. The backend resolves each to a frozen
  // snapshot (title/name/relation) and renders one block per person. At least one
  // is required for a company client.
  acknowledgement_person_ids: z.array(z.string().trim().min(1)).optional(),
  // The tax-practice services to LIST in the letter, each with an OPTIONAL free-text
  // description. Letter-only — this never writes tax_client_services. The backend
  // re-resolves each id to its service NAME (active tax-practice only) and freezes
  // { name, description } into params; at least one valid service is required.
  services: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        description: z.string().trim().max(1000, 'Description is too long').optional(),
      }),
    )
    .optional(),
})

// Add a free-text note to a letter.
export const addEngagementLetterNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000, 'Note is too long'),
})

export type CreateEngagementLetterInput = z.infer<typeof createEngagementLetterSchema>
export type AddEngagementLetterNoteInput = z.infer<typeof addEngagementLetterNoteSchema>
