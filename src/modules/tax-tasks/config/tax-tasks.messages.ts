export const taxTaskMessages = {
  LIST_FETCHED: 'Tasks fetched successfully',
  FILTER_OPTIONS_FETCHED: 'Filter options fetched successfully',
  FETCHED: 'Task fetched successfully',
  CREATED: 'Task created successfully',
  STATUS_UPDATED: 'Task status updated successfully',
  REASSIGNED: 'Task assignment updated successfully',
  CHECKLIST_UPDATED: 'Checklist updated successfully',
  NOT_FOUND: 'Task not found',

  // Single-field edits (PATCH /:id/:field)
  PRIORITY_UPDATED: 'Priority updated successfully',
  WORK_STATUS_UPDATED: 'Work status updated successfully',
  DESCRIPTION_UPDATED: 'Description updated successfully',
  DUE_DATE_UPDATED: 'Due date updated successfully',
  PERIOD_DATES_UPDATED: 'Period dates updated successfully',
  UNKNOWN_FIELD: 'That task field cannot be edited',
  EDIT_FORBIDDEN: 'You do not have permission to edit this task',

  // Status change
  ONLY_REVIEWER_COMPLETES: 'Only the task reviewer can mark it completed',
  REQUIRED_CHECKLIST_INCOMPLETE:
    'All required checklist items must be completed before the task can be marked completed',

  // Reassignment
  REASSIGN_FORBIDDEN: 'You do not have permission to reassign this task',

  // Checklist
  CHECKLIST_ITEM_NOT_FOUND: 'Checklist item not found on this task',
  CHECKLIST_HEADING_REQUIRED: 'A checklist item needs a heading',

  // Comments
  COMMENTS_FETCHED: 'Comments fetched successfully',
  COMMENT_ADDED: 'Comment added successfully',
  COMMENT_UPDATED: 'Comment updated successfully',
  COMMENT_DELETED: 'Comment deleted successfully',
  COMMENT_NOT_FOUND: 'Comment not found',
  COMMENT_BODY_REQUIRED: 'Comment text is required',
  COMMENT_NOT_AUTHOR: 'You can only edit or delete your own comments',
  PARENT_COMMENT_NOT_FOUND: 'The comment you are replying to does not exist',
  REPLY_TO_REPLY: 'You can only reply to a top-level comment',

  // Activity
  ACTIVITY_FETCHED: 'Activity fetched successfully',

  // Visibility
  NO_VIEW_PERMISSION: 'You do not have permission to view tasks',

  // References
  CLIENT_REQUIRED: 'Client is required',
  CLIENT_NOT_FOUND: 'Selected client does not exist',
  CLIENT_NOT_ACCESSIBLE: 'You do not have access to this client',
  TITLE_REQUIRED: 'A task title is required',
  SERVICE_REQUIRED: 'Service is required',
  SERVICE_NOT_FOUND: 'Selected service does not exist',
  SERVICE_NOT_TAX: 'Selected service is not a tax-practice service',
  FINANCIAL_YEAR_REQUIRED: 'Financial year is required',
  FINANCIAL_YEAR_NOT_FOUND: 'Selected financial year does not exist',
  PREPARER_NOT_FOUND: 'Selected preparer is not a valid member',
  REVIEWER_NOT_FOUND: 'Selected reviewer is not a valid member',
  WORK_STATUS_NOT_FOUND: 'Selected work status does not exist',
  WORK_STATUS_INACTIVE: 'Selected work status is not active',

  // Frequency / period
  FREQUENCY_INVALID: 'Selected frequency is not available for that service',
  QUARTER_REQUIRED: 'A quarter (1-4) is required for a quarterly task',
  MONTH_REQUIRED: 'A month (1-12) is required for this task',
  HALF_REQUIRED: 'A fortnight half (1 or 2) is required for a fortnightly task',
  WEEK_REQUIRED: 'A week (1-5) is required for a weekly task',
  PERIOD_INVALID: 'The period does not match the task frequency',
  PERIOD_DATES_NOT_ALLOWED:
    'Period start/end dates apply only to weekly, fortnightly or one-time tasks',
  PERIOD_DATES_ORDER: 'Period end date cannot be before the start date',

  // Uniqueness
  DUPLICATE: 'A task already exists for this client, service and period',

  // Fields
  DUE_DATE_INVALID: 'Due date must be a valid date/time',
  PERIOD_DATE_INVALID: 'Period date must be a valid date',
  INVALID_PRIORITY: 'Invalid task priority',
  INVALID_FREQUENCY: 'Invalid frequency',
}
