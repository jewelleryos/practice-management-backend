export const workStatusMessages = {
  LIST_FETCHED: 'Work statuses fetched successfully',
  FETCHED: 'Work status fetched successfully',
  CREATED: 'Work status created successfully',
  UPDATED: 'Work status updated successfully',
  NOT_FOUND: 'Work status not found',
  NAME_REQUIRED: 'Name is required',
  NAME_EXISTS: 'A work status with this name already exists',
  COLOR_REQUIRED: 'Colour is required',
  COLOR_INVALID: 'Colour must be a hex value like #16A34A',
  // Default ⇔ active invariant.
  DEFAULT_MUST_BE_ACTIVE: 'A default work status must be active',
  DEACTIVATE_DEFAULT_BLOCKED:
    'This is the default work status. Set another status as default first, then deactivate this one.',
}
