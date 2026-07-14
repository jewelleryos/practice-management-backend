export const memberMessages = {
  LIST_FETCHED: 'Members fetched successfully',
  FETCHED: 'Member fetched successfully',
  CREATED: 'Member created successfully',
  UPDATED: 'Member updated successfully',
  STATUS_UPDATED: 'Member status updated successfully',
  NOT_FOUND: 'Member not found',

  // Validation
  FIRST_NAME_REQUIRED: 'First name is required',
  LAST_NAME_REQUIRED: 'Last name is required',
  INVALID_EMAIL: 'A valid email address is required',
  EMAIL_EXISTS: 'A member with this email already exists',
  PASSWORD_REQUIRED: 'A password is required',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters',
  ROLE_REQUIRED: 'A role is required',
  ROLE_NOT_FOUND: 'The selected role no longer exists',
  INVALID_DEPARTMENTS: 'Invalid department selection',
  INVALID_PERMISSIONS: 'One or more permission codes are invalid',
  FIRM_NOT_FOUND: 'One or more selected firms no longer exist',
  FIRM_DEPARTMENT_MISMATCH:
    "A selected firm belongs to a department this member doesn't have access to",

  // Guards
  CANNOT_EDIT_OWN_PERMISSIONS: 'You do not have permission to change your own role or permissions',
  CANNOT_DEACTIVATE_SELF: 'You cannot deactivate your own account',
}
