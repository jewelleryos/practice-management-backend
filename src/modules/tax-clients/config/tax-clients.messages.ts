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
}
