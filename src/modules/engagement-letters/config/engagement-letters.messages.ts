// User-facing messages for the engagement-letters module. Toasts on the frontend
// surface the backend message, so keep them clear and human.
export const engagementLetterMessages = {
  LIST_FETCHED: 'Engagement letters fetched successfully',
  FETCHED: 'Engagement letter fetched successfully',
  CREATED: 'Engagement letter created successfully',
  NOT_FOUND: 'Engagement letter not found',

  CLIENT_NOT_FOUND: 'Client not found',
  FIRM_NOT_ACCESSIBLE: 'You do not have access to this client’s firm',
  // The firm has no letter head yet — one must be created before letters can be generated.
  NO_LETTERHEAD: 'This client’s firm has no letter head yet — create one first',

  // Per-version parameter validation.
  MISSING_REQUIRED_FIELD: 'Please fill in all required fields',
  INVALID_DATE: 'Please choose a valid date',
  // The discussion date sits after the letter date (it must be on or before it).
  DISCUSSION_DATE_AFTER_LETTER: 'The discussion date must be on or before the letter date',
  // The "advice and/or service" choice was not one of the allowed options.
  INVALID_RESPONSIBILITY_TYPE: 'Please choose advice, service, or advice and service',
  // The engagement period ends before it starts.
  ENGAGEMENT_END_BEFORE_START: 'The engagement period end date must be on or after the start date',

  // Addressee (who the letter is written to).
  // A company client was submitted without choosing which related person to address.
  RELATIVE_REQUIRED: 'Please choose the person this letter is addressed to',
  // The chosen person is not a person relation of this client.
  INVALID_RELATIVE: 'The selected person is not a relation of this client',
  // No (valid) service was chosen — the letter must list at least one.
  SERVICES_REQUIRED: 'Please select at least one service',

  NOTES_FETCHED: 'Notes fetched successfully',
  NOTE_ADDED: 'Note added successfully',

  TEMPLATE_FETCHED: 'Template fetched successfully',
  PREFLIGHT_FETCHED: 'Fetched successfully',
} as const
