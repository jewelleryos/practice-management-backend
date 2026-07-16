// Permission codes — the single source of truth for every access check.
//
// A permission is just a number; roles bundle these numbers, and members get one
// global role plus optional per-member extra/revoked overrides.
//
// Numbering: cross-department (global) modules use small blocks
//   1xx MEMBER · 2xx ROLE · 3xx FIRM … 9xx SERVICE
// Department-scoped modules use per-department thousand-blocks
//   1xxx Tax Practice · 2xxx Mortgage
// The nine hundred-blocks are now full, so further global masters overflow into
// the 10000+ range (one 100-block each: 100xx NOTE_TYPE), keeping 1xxx–2xxx
// exclusively for the two fixed departments.
// so the same conceptual module (e.g. "Clients") gets a distinct code set per
// department. Each permission is tagged with its department in PERMISSION_MODULES
// below (null = cross-department), which lets the UI show a member only the
// modules for the departments they can access, and lets us GATE a member's role
// permissions by their department access.

import { DEPARTMENTS, type DepartmentCode } from './departments.constants'

// Ergonomic code lookup — used in middleware, e.g. authWithPermission(PERMISSIONS.MEMBER.READ).
export const PERMISSIONS = {
  // ── Cross-department (global) modules ──
  // Block 1 — Team members (Team Management)
  MEMBER: {
    CREATE: 101,
    READ: 102,
    UPDATE: 103,
    DEACTIVATE: 104, // we soft-disable members, never hard-delete
    UPDATE_OWN_PERMISSIONS: 105, // gate for editing one's own role/overrides
  },
  // Block 2 — Roles
  ROLE: {
    CREATE: 201,
    READ: 202,
    UPDATE: 203,
    DELETE: 204,
  },
  // Block 3 — Firms (master data)
  FIRM: {
    CREATE: 301,
    READ: 302,
    UPDATE: 303,
    DELETE: 304,
  },
  // Block 4 — Financial Years (master data)
  // DELETE (404) is intentionally omitted for now — financial years cannot be
  // deleted yet (see root CLAUDE.md; the delete flow is deferred).
  FINANCIAL_YEAR: {
    CREATE: 401,
    READ: 402,
    UPDATE: 403,
  },
  // Blocks 5-8 — "Simple" master data (name + description). DELETE (x04) is
  // omitted for now — these cannot be deleted yet (deferred; see root CLAUDE.md).
  ENTITY_TYPE: {
    CREATE: 501,
    READ: 502,
    UPDATE: 503,
  },
  CLIENT_GROUP: {
    CREATE: 601,
    READ: 602,
    UPDATE: 603,
  },
  SOFTWARE: {
    CREATE: 701,
    READ: 702,
    UPDATE: 703,
  },
  RELATION_TYPE: {
    CREATE: 801,
    READ: 802,
    UPDATE: 803,
  },
  // Block 9 — Services (master data). Name + description + one or more fixed
  // frequencies. DELETE (904) omitted for now — deferred (see root CLAUDE.md).
  SERVICE: {
    CREATE: 901,
    READ: 902,
    UPDATE: 903,
  },
  // Block 10 — Note Types (master data). Name + description + a "sensitive" flag.
  // Codes overflow into the 10000+ range (the nine hundred-blocks are full; the
  // 1xxx-2xxx thousand-blocks belong to the fixed departments). DELETE omitted.
  NOTE_TYPE: {
    CREATE: 10001,
    READ: 10002,
    UPDATE: 10003,
  },
  // Block 11 — Services Checklist (master data). Default checklist items per
  // service, later copied onto tasks. Next 100-block in the 10000+ overflow range.
  // DELETE omitted for now — deferred (see root CLAUDE.md). Items also carry an
  // is_active toggle, changed via UPDATE (no separate deactivate permission).
  SERVICE_CHECKLIST: {
    CREATE: 10101,
    READ: 10102,
    UPDATE: 10103,
  },
  // Block 12 — Work Statuses (master data). Task-progress statuses, each with a
  // display colour and an is_active toggle. Next 100-block in the 10000+ overflow
  // range. DELETE omitted for now — deferred (retire via is_active instead).
  WORK_STATUS: {
    CREATE: 10201,
    READ: 10202,
    UPDATE: 10203,
  },
  // Block 13 — Type of Loan (master data). Name + description lookup the mortgage
  // task picks its loan type from. Cross-department master; next 100-block in the
  // 10000+ overflow range. DELETE omitted for now — deferred (see root CLAUDE.md).
  LOAN_TYPE: {
    CREATE: 10301,
    READ: 10302,
    UPDATE: 10303,
  },

  // ── Department-scoped modules ──
  // "Clients" exists once per department as two separate permission sets. The
  // client tables/modules are built later; the codes live here now because the
  // department-scoped access model is designed around them.
  TAX_CLIENT: {
    CREATE: 1001,
    READ: 1002,
    UPDATE: 1003,
    DELETE: 1004,
    // Gate for viewing client notes whose note-type is marked sensitive. Without
    // it, sensitive notes are excluded from responses entirely (never masked).
    VIEW_SENSITIVE_NOTES: 1005,
  },
  // Tax-practice tasks — work done for a tax client, per service, per period.
  // Department-scoped (like TAX_CLIENT); mortgage tasks get their own
  // MORTGAGE_TASK block in the 2xxx range later. Next 100-block after TAX_CLIENT
  // (1001-1005). NO edit permission: mutation rights come from business rules
  // (assignment + reviewer-only completion), not a code. The two VIEW_* codes are
  // a data scope enforced on the backend:
  //   VIEW_ALL       — see every tax-practice task
  //   VIEW_ASSIGNED  — see only tasks where the caller is preparer or reviewer
  // VIEW_ACTIVITY gates whether the caller can read a task's activity log.
  TAX_TASK: {
    CREATE: 1101,
    VIEW_ALL: 1102,
    VIEW_ASSIGNED: 1103,
    VIEW_ACTIVITY: 1104,
  },
  // Work Status board (tax_practice) — the service-wise task-status grid (status
  // per client across periods). Its OWN view-only permission, deliberately SEPARATE
  // from the TAX_TASK view codes: a member can be granted the board overview
  // without task access (and vice-versa). Next 100-block after TAX_TASK.
  WORK_STATUS_BOARD: {
    VIEW: 1201,
    // Change a task's work status directly from the board (its own capability,
    // independent of task edit rights). Enforced by a dedicated board route.
    CHANGE_WORK_STATUS: 1202,
  },
  // Personal tasks (tax_practice) — a member's private to-dos, visible only to
  // the creator and the followers they loop in. A SINGLE permission gates access
  // to the whole module (create + see own + edit own); there is no CREATE/VIEW
  // split because everything visible is already the caller's own task. Next
  // 100-block after WORK_STATUS_BOARD. Mortgage gets its own 2xxx block later.
  TAX_PERSONAL_TASK: {
    ACCESS: 1301,
  },
  MORTGAGE_CLIENT: {
    CREATE: 2001,
    READ: 2002,
    UPDATE: 2003,
    DELETE: 2004,
  },
  // Mortgage service tasks — department-scoped (like MORTGAGE_CLIENT). Next 100-block
  // after MORTGAGE_CLIENT (2001-2004). Mirrors the tax-task shape: no dedicated edit
  // code — write rights come from the creator/follower business rule (visibility =
  // writability). Firm access (member_firms) is the outer boundary on every read/write.
  //   VIEW          — see tasks the caller created or follows (within their firms)
  //   VIEW_ALL      — see every task in the firms the caller can access
  //   VIEW_ACTIVITY — read a task's activity log
  MORTGAGE_TASK: {
    CREATE: 2101,
    VIEW: 2102,
    VIEW_ALL: 2103,
    VIEW_ACTIVITY: 2104,
  },
  // Personal tasks (mortgage) — a member's private to-dos, visible only to the
  // creator and their followers. A SINGLE permission gates the whole module (same
  // shape as TAX_PERSONAL_TASK). Next 100-block after MORTGAGE_TASK.
  MORTGAGE_PERSONAL_TASK: {
    ACCESS: 2201,
  },
} as const

export type PermissionAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'DEACTIVATE'
  | 'UPDATE_OWN_PERMISSIONS'
  | 'VIEW_SENSITIVE_NOTES'
  | 'VIEW_ALL'
  | 'VIEW_ASSIGNED'
  | 'VIEW_ACTIVITY'
  | 'VIEW'
  | 'CHANGE_WORK_STATUS'
  | 'ACCESS'

export interface PermissionDef {
  code: number
  action: PermissionAction
  label: string
  requires: number[] // prerequisite codes — must be held to use this permission
}

export interface PermissionModule {
  key: string // module key — the SAME key can repeat across departments (e.g. 'clients')
  label: string // display name
  department: DepartmentCode | null // null = cross-department (global)
  permissions: PermissionDef[]
}

// The full registry. The frontend groups this by department → module to render
// the permission picker when creating a role, and to show a member only the
// modules for the departments they can access. `requires` lists prerequisite
// codes: every action requires its module's READ, so ticking an action ticks
// READ, and unticking READ unticks its dependent actions.
export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'members',
    label: 'Team Members',
    department: null,
    permissions: [
      { code: PERMISSIONS.MEMBER.CREATE, action: 'CREATE', label: 'Create members', requires: [PERMISSIONS.MEMBER.READ] },
      { code: PERMISSIONS.MEMBER.READ, action: 'READ', label: 'View members', requires: [] },
      { code: PERMISSIONS.MEMBER.UPDATE, action: 'UPDATE', label: 'Edit members', requires: [PERMISSIONS.MEMBER.READ] },
      { code: PERMISSIONS.MEMBER.DEACTIVATE, action: 'DEACTIVATE', label: 'Deactivate members', requires: [PERMISSIONS.MEMBER.READ] },
      {
        code: PERMISSIONS.MEMBER.UPDATE_OWN_PERMISSIONS,
        action: 'UPDATE_OWN_PERMISSIONS',
        label: 'Edit own role/permissions',
        requires: [PERMISSIONS.MEMBER.READ],
      },
    ],
  },
  {
    key: 'roles',
    label: 'Roles',
    department: null,
    permissions: [
      { code: PERMISSIONS.ROLE.CREATE, action: 'CREATE', label: 'Create roles', requires: [PERMISSIONS.ROLE.READ] },
      { code: PERMISSIONS.ROLE.READ, action: 'READ', label: 'View roles', requires: [] },
      { code: PERMISSIONS.ROLE.UPDATE, action: 'UPDATE', label: 'Edit roles', requires: [PERMISSIONS.ROLE.READ] },
      { code: PERMISSIONS.ROLE.DELETE, action: 'DELETE', label: 'Delete roles', requires: [PERMISSIONS.ROLE.READ] },
    ],
  },
  {
    key: 'firms',
    label: 'Firms',
    department: null,
    permissions: [
      { code: PERMISSIONS.FIRM.CREATE, action: 'CREATE', label: 'Create firms', requires: [PERMISSIONS.FIRM.READ] },
      { code: PERMISSIONS.FIRM.READ, action: 'READ', label: 'View firms', requires: [] },
      { code: PERMISSIONS.FIRM.UPDATE, action: 'UPDATE', label: 'Edit firms', requires: [PERMISSIONS.FIRM.READ] },
      { code: PERMISSIONS.FIRM.DELETE, action: 'DELETE', label: 'Delete firms', requires: [PERMISSIONS.FIRM.READ] },
    ],
  },
  {
    key: 'financial_years',
    label: 'Financial Years',
    department: null,
    permissions: [
      { code: PERMISSIONS.FINANCIAL_YEAR.CREATE, action: 'CREATE', label: 'Create financial years', requires: [PERMISSIONS.FINANCIAL_YEAR.READ] },
      { code: PERMISSIONS.FINANCIAL_YEAR.READ, action: 'READ', label: 'View financial years', requires: [] },
      { code: PERMISSIONS.FINANCIAL_YEAR.UPDATE, action: 'UPDATE', label: 'Edit financial years', requires: [PERMISSIONS.FINANCIAL_YEAR.READ] },
    ],
  },
  {
    key: 'entity_types',
    label: 'Entity Types',
    department: null,
    permissions: [
      { code: PERMISSIONS.ENTITY_TYPE.CREATE, action: 'CREATE', label: 'Create entity types', requires: [PERMISSIONS.ENTITY_TYPE.READ] },
      { code: PERMISSIONS.ENTITY_TYPE.READ, action: 'READ', label: 'View entity types', requires: [] },
      { code: PERMISSIONS.ENTITY_TYPE.UPDATE, action: 'UPDATE', label: 'Edit entity types', requires: [PERMISSIONS.ENTITY_TYPE.READ] },
    ],
  },
  {
    key: 'client_groups',
    label: 'Client Groups',
    department: null,
    permissions: [
      { code: PERMISSIONS.CLIENT_GROUP.CREATE, action: 'CREATE', label: 'Create client groups', requires: [PERMISSIONS.CLIENT_GROUP.READ] },
      { code: PERMISSIONS.CLIENT_GROUP.READ, action: 'READ', label: 'View client groups', requires: [] },
      { code: PERMISSIONS.CLIENT_GROUP.UPDATE, action: 'UPDATE', label: 'Edit client groups', requires: [PERMISSIONS.CLIENT_GROUP.READ] },
    ],
  },
  {
    key: 'software',
    label: 'Software',
    department: null,
    permissions: [
      { code: PERMISSIONS.SOFTWARE.CREATE, action: 'CREATE', label: 'Create software', requires: [PERMISSIONS.SOFTWARE.READ] },
      { code: PERMISSIONS.SOFTWARE.READ, action: 'READ', label: 'View software', requires: [] },
      { code: PERMISSIONS.SOFTWARE.UPDATE, action: 'UPDATE', label: 'Edit software', requires: [PERMISSIONS.SOFTWARE.READ] },
    ],
  },
  {
    key: 'relation_types',
    label: 'Relation Types',
    department: null,
    permissions: [
      { code: PERMISSIONS.RELATION_TYPE.CREATE, action: 'CREATE', label: 'Create relation types', requires: [PERMISSIONS.RELATION_TYPE.READ] },
      { code: PERMISSIONS.RELATION_TYPE.READ, action: 'READ', label: 'View relation types', requires: [] },
      { code: PERMISSIONS.RELATION_TYPE.UPDATE, action: 'UPDATE', label: 'Edit relation types', requires: [PERMISSIONS.RELATION_TYPE.READ] },
    ],
  },
  {
    key: 'services',
    label: 'Services',
    department: null,
    permissions: [
      { code: PERMISSIONS.SERVICE.CREATE, action: 'CREATE', label: 'Create services', requires: [PERMISSIONS.SERVICE.READ] },
      { code: PERMISSIONS.SERVICE.READ, action: 'READ', label: 'View services', requires: [] },
      { code: PERMISSIONS.SERVICE.UPDATE, action: 'UPDATE', label: 'Edit services', requires: [PERMISSIONS.SERVICE.READ] },
    ],
  },
  {
    key: 'note_types',
    label: 'Note Types',
    department: null,
    permissions: [
      { code: PERMISSIONS.NOTE_TYPE.CREATE, action: 'CREATE', label: 'Create note types', requires: [PERMISSIONS.NOTE_TYPE.READ] },
      { code: PERMISSIONS.NOTE_TYPE.READ, action: 'READ', label: 'View note types', requires: [] },
      { code: PERMISSIONS.NOTE_TYPE.UPDATE, action: 'UPDATE', label: 'Edit note types', requires: [PERMISSIONS.NOTE_TYPE.READ] },
    ],
  },
  {
    key: 'service_checklists',
    label: 'Service Checklists',
    department: null,
    permissions: [
      { code: PERMISSIONS.SERVICE_CHECKLIST.CREATE, action: 'CREATE', label: 'Create checklist items', requires: [PERMISSIONS.SERVICE_CHECKLIST.READ] },
      { code: PERMISSIONS.SERVICE_CHECKLIST.READ, action: 'READ', label: 'View service checklists', requires: [] },
      { code: PERMISSIONS.SERVICE_CHECKLIST.UPDATE, action: 'UPDATE', label: 'Edit checklist items', requires: [PERMISSIONS.SERVICE_CHECKLIST.READ] },
    ],
  },
  {
    key: 'work_statuses',
    label: 'Work Statuses',
    department: null,
    permissions: [
      { code: PERMISSIONS.WORK_STATUS.CREATE, action: 'CREATE', label: 'Create work statuses', requires: [PERMISSIONS.WORK_STATUS.READ] },
      { code: PERMISSIONS.WORK_STATUS.READ, action: 'READ', label: 'View work statuses', requires: [] },
      { code: PERMISSIONS.WORK_STATUS.UPDATE, action: 'UPDATE', label: 'Edit work statuses', requires: [PERMISSIONS.WORK_STATUS.READ] },
    ],
  },
  {
    key: 'loan_types',
    label: 'Type of Loan',
    department: null,
    permissions: [
      { code: PERMISSIONS.LOAN_TYPE.CREATE, action: 'CREATE', label: 'Create loan types', requires: [PERMISSIONS.LOAN_TYPE.READ] },
      { code: PERMISSIONS.LOAN_TYPE.READ, action: 'READ', label: 'View loan types', requires: [] },
      { code: PERMISSIONS.LOAN_TYPE.UPDATE, action: 'UPDATE', label: 'Edit loan types', requires: [PERMISSIONS.LOAN_TYPE.READ] },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    department: DEPARTMENTS.TAX_PRACTICE,
    permissions: [
      { code: PERMISSIONS.TAX_CLIENT.CREATE, action: 'CREATE', label: 'Create clients', requires: [PERMISSIONS.TAX_CLIENT.READ] },
      { code: PERMISSIONS.TAX_CLIENT.READ, action: 'READ', label: 'View clients', requires: [] },
      { code: PERMISSIONS.TAX_CLIENT.UPDATE, action: 'UPDATE', label: 'Edit clients', requires: [PERMISSIONS.TAX_CLIENT.READ] },
      { code: PERMISSIONS.TAX_CLIENT.DELETE, action: 'DELETE', label: 'Delete clients', requires: [PERMISSIONS.TAX_CLIENT.READ] },
      { code: PERMISSIONS.TAX_CLIENT.VIEW_SENSITIVE_NOTES, action: 'VIEW_SENSITIVE_NOTES', label: 'View sensitive notes', requires: [PERMISSIONS.TAX_CLIENT.READ] },
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    department: DEPARTMENTS.TAX_PRACTICE,
    // Four independent capabilities, no requires between them:
    //  - CREATE has no prerequisite — tasks are created from the client or
    //    work-status modules, not from inside a Tasks view.
    //  - VIEW_ALL / VIEW_ASSIGNED are a data SCOPE enforced on the backend
    //    (all tasks vs. only tasks where the caller is preparer/reviewer).
    //  - VIEW_ACTIVITY gates reading a task's activity log.
    // There is NO edit permission: mutation rights come from business rules
    // (assignment + reviewer-only completion), enforced per route.
    permissions: [
      { code: PERMISSIONS.TAX_TASK.CREATE, action: 'CREATE', label: 'Create tasks', requires: [] },
      { code: PERMISSIONS.TAX_TASK.VIEW_ALL, action: 'VIEW_ALL', label: 'View all tasks', requires: [] },
      { code: PERMISSIONS.TAX_TASK.VIEW_ASSIGNED, action: 'VIEW_ASSIGNED', label: 'View assigned tasks', requires: [] },
      { code: PERMISSIONS.TAX_TASK.VIEW_ACTIVITY, action: 'VIEW_ACTIVITY', label: 'View task activity log', requires: [] },
    ],
  },
  {
    key: 'work-status',
    label: 'Work Status',
    department: DEPARTMENTS.TAX_PRACTICE,
    // View-only board (service-wise task status per client). Its own permission,
    // independent of the Tasks module's view codes. CHANGE_WORK_STATUS lets a
    // member change any task's work status directly from the board.
    permissions: [
      { code: PERMISSIONS.WORK_STATUS_BOARD.VIEW, action: 'VIEW', label: 'View work status board', requires: [] },
      {
        code: PERMISSIONS.WORK_STATUS_BOARD.CHANGE_WORK_STATUS,
        action: 'CHANGE_WORK_STATUS',
        label: 'Change work status',
        requires: [PERMISSIONS.WORK_STATUS_BOARD.VIEW],
      },
    ],
  },
  {
    key: 'personal-tasks',
    label: 'Personal Tasks',
    department: DEPARTMENTS.TAX_PRACTICE,
    // One permission: does this member have access to the personal-task module or
    // not. Grants create + see/edit own (creator or follower). No CREATE/VIEW split.
    permissions: [
      { code: PERMISSIONS.TAX_PERSONAL_TASK.ACCESS, action: 'ACCESS', label: 'Access personal tasks', requires: [] },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    department: DEPARTMENTS.MORTGAGE,
    permissions: [
      { code: PERMISSIONS.MORTGAGE_CLIENT.CREATE, action: 'CREATE', label: 'Create clients', requires: [PERMISSIONS.MORTGAGE_CLIENT.READ] },
      { code: PERMISSIONS.MORTGAGE_CLIENT.READ, action: 'READ', label: 'View clients', requires: [] },
      { code: PERMISSIONS.MORTGAGE_CLIENT.UPDATE, action: 'UPDATE', label: 'Edit clients', requires: [PERMISSIONS.MORTGAGE_CLIENT.READ] },
      { code: PERMISSIONS.MORTGAGE_CLIENT.DELETE, action: 'DELETE', label: 'Delete clients', requires: [PERMISSIONS.MORTGAGE_CLIENT.READ] },
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    department: DEPARTMENTS.MORTGAGE,
    // Firm access (member_firms) bounds every read/write. VIEW vs VIEW_ALL is the
    // breadth (own/followed vs all in the firm); writes follow visibility (no edit
    // code). VIEW_ACTIVITY gates the activity log and needs VIEW.
    permissions: [
      { code: PERMISSIONS.MORTGAGE_TASK.CREATE, action: 'CREATE', label: 'Create tasks', requires: [PERMISSIONS.MORTGAGE_TASK.VIEW] },
      { code: PERMISSIONS.MORTGAGE_TASK.VIEW, action: 'VIEW', label: 'View own/followed tasks', requires: [] },
      { code: PERMISSIONS.MORTGAGE_TASK.VIEW_ALL, action: 'VIEW_ALL', label: 'View all firm tasks', requires: [PERMISSIONS.MORTGAGE_TASK.VIEW] },
      { code: PERMISSIONS.MORTGAGE_TASK.VIEW_ACTIVITY, action: 'VIEW_ACTIVITY', label: 'View task activity log', requires: [PERMISSIONS.MORTGAGE_TASK.VIEW] },
    ],
  },
  {
    key: 'personal-tasks',
    label: 'Personal Tasks',
    department: DEPARTMENTS.MORTGAGE,
    // One permission: access to the personal-task module (create + see/edit own as
    // creator or follower). No CREATE/VIEW split.
    permissions: [
      { code: PERMISSIONS.MORTGAGE_PERSONAL_TASK.ACCESS, action: 'ACCESS', label: 'Access personal tasks', requires: [] },
    ],
  },
]

// Flat list of every defined permission code (handy for validation / seeding).
export const ALL_PERMISSION_CODES: number[] = PERMISSION_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.code)
)

// code → its department (null = global). Used to gate a member's effective
// permissions by their department access: a permission only applies if it is
// global, or belongs to a department the member has access to.
export const PERMISSION_DEPARTMENT: Record<number, DepartmentCode | null> = Object.fromEntries(
  PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => [p.code, m.department]))
)
