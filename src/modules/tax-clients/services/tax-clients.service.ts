import type { PoolClient } from 'pg'
import { db } from '../../../lib/db'
import { taxClientMessages } from '../config/tax-clients.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { PERMISSIONS } from '../../../config/permissions.constants'
import { SERVICE_FREQUENCY_VALUES } from '../../../config/service-frequencies.constants'
import { australianStateName } from '../../../config/australian-states.constants'
import { annualReviewService } from '../../annual-reviews/services/annual-reviews.service'
import type { AuthUser } from '../../../middleware/auth.middleware'
import type {
  CreateTaxClientRequest,
  UpdateTaxClientRequest,
  ListTaxClientsQuery,
  TaxClientListResponse,
  TaxClientDetail,
  RelationshipView,
  ServiceView,
  NoteView,
  ExportTaxClientsQuery,
  ExportRow,
  ImportableClient,
  ImportResult,
  TaxClientDeletionImpact,
} from '../types/tax-clients.types'

export const taxClientService = {
  // Firms this member can see clients for: their granted firms that belong to the
  // Tax Practice department. Visibility everywhere is scoped to this set.
  async accessibleFirmIds(memberId: string): Promise<string[]> {
    const result = await db.query(
      `SELECT mf.firm_id
       FROM member_firms mf
       JOIN firms f ON f.id = mf.firm_id AND f.is_deleted = FALSE AND f.department = 'tax_practice'
       WHERE mf.member_id = $1`,
      [memberId],
    )
    return result.rows.map((r) => r.firm_id as string)
  },

  // ── LIST (server-driven: firm-scoped, filtered, sorted, paginated) ──
  async list(actingUser: AuthUser, q: ListTaxClientsQuery): Promise<TaxClientListResponse> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) {
      return { items: [], total: 0, page: q.page, pageSize: q.pageSize, totalPages: 0 }
    }

    const params: any[] = [firmIds]
    // Filters are multi-value: `= ANY($n)` with a string[] param. csvOf never
    // yields an empty array, so a falsy check still means "no filter".
    const where: string[] = ['c.is_deleted = FALSE', 'c.firm_id = ANY($1)']

    if (q.firm_id) {
      params.push(q.firm_id)
      where.push(`c.firm_id = ANY($${params.length})`)
    }
    if (q.entity_type_id) {
      params.push(q.entity_type_id)
      where.push(`c.entity_type_id = ANY($${params.length})`)
    }
    if (q.client_group_id) {
      params.push(q.client_group_id)
      where.push(`c.client_group_id = ANY($${params.length})`)
    }
    if (q.software_id) {
      params.push(q.software_id)
      where.push(`c.software_id = ANY($${params.length})`)
    }
    if (q.status) {
      params.push(q.status)
      where.push(`c.status = ANY($${params.length})`)
    }
    if (q.search) {
      params.push(`%${q.search}%`)
      where.push(`c.name ILIKE $${params.length}`)
    }
    const whereSql = where.join(' AND ')

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM tax_clients c WHERE ${whereSql}`,
      params,
    )
    const total = countResult.rows[0].total as number

    // Sort column + direction are allowlisted (never interpolate raw input).
    const sortCol = q.sort_by === 'created_at' ? 'c.created_at' : 'LOWER(c.name)'
    const sortDir = q.sort_dir === 'desc' ? 'DESC' : 'ASC'
    const offset = (q.page - 1) * q.pageSize

    const rowsResult = await db.query(
      `SELECT c.id, c.name, c.is_company, c.status, c.created_at,
              c.firm_id, f.name AS firm_name,
              c.entity_type_id, et.name AS entity_type_name,
              c.client_group_id, cg.name AS client_group_name,
              c.software_id, sw.name AS software_name,
              c.assignee_id,
              CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS assignee_name,
              EXISTS (
                SELECT 1 FROM engagement_letters el
                WHERE el.client_id = c.id AND el.is_deleted = FALSE
              ) AS engagement_letter_exists
       FROM tax_clients c
       LEFT JOIN firms f ON f.id = c.firm_id
       LEFT JOIN entity_types et ON et.id = c.entity_type_id
       LEFT JOIN client_groups cg ON cg.id = c.client_group_id
       LEFT JOIN software sw ON sw.id = c.software_id
       LEFT JOIN members a ON a.id = c.assignee_id
       WHERE ${whereSql}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, offset],
    )

    return {
      items: rowsResult.rows,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages: Math.ceil(total / q.pageSize),
    }
  },

  // ── DETAIL (firm-scoped) ──
  async getById(actingUser: AuthUser, id: string): Promise<TaxClientDetail> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)

    const result = await db.query(
      `SELECT c.id, c.firm_id, f.name AS firm_name,
              c.name, c.is_company, c.gender, c.title,
              c.entity_type_id, et.name AS entity_type_name,
              c.dob_or_incorporation_date, c.abn, c.acn, c.trading_name,
              c.address_line, c.locality, c.state, c.state_code, c.postcode,
              c.email,
              c.bank_account_name, c.bank_account_prefix, c.bank_account_number,
              c.director_id,
              c.client_group_id, cg.name AS client_group_name,
              c.software_id, sw.name AS software_name,
              c.assignee_id,
              CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS assignee_name,
              c.status, c.created_at, c.updated_at
       FROM tax_clients c
       LEFT JOIN firms f ON f.id = c.firm_id
       LEFT JOIN entity_types et ON et.id = c.entity_type_id
       LEFT JOIN client_groups cg ON cg.id = c.client_group_id
       LEFT JOIN software sw ON sw.id = c.software_id
       LEFT JOIN members a ON a.id = c.assignee_id
       WHERE c.id = $1 AND c.is_deleted = FALSE`,
      [id],
    )
    const row = result.rows[0]
    // Firm-scoped: a client outside the member's firms is treated as not found.
    if (!row || !firmIds.includes(row.firm_id)) {
      throw new AppError(taxClientMessages.NOT_FOUND, HTTP_STATUS.NOT_FOUND)
    }

    const canSeeSensitive = actingUser.permissions.includes(
      PERMISSIONS.TAX_CLIENT.VIEW_SENSITIVE_NOTES,
    )

    const [relationships, services, notes, pending_task_count] = await Promise.all([
      this.relationshipsFor(id),
      this.servicesFor(id),
      this.notesFor(id, canSeeSensitive),
      this.pendingTaskCountFor(id, actingUser),
    ])

    return { ...row, relationships, services, notes, pending_task_count }
  },

  // Count of this client's non-completed tasks (both general + service), scoped to
  // what the viewer may see — mirrors the task list's permission scoping so the tab
  // badge matches the tab's contents. VIEW_ALL → every task; VIEW_ASSIGNED only →
  // tasks the caller prepares or reviews; neither (create-only / none) → 0. The
  // client's firm is already validated as accessible by the caller in getById.
  async pendingTaskCountFor(clientId: string, actingUser: AuthUser): Promise<number> {
    const canViewAll = actingUser.permissions.includes(PERMISSIONS.TAX_TASK.VIEW_ALL)
    const canViewAssigned = actingUser.permissions.includes(PERMISSIONS.TAX_TASK.VIEW_ASSIGNED)
    if (!canViewAll && !canViewAssigned) return 0

    const params: unknown[] = [clientId]
    let assignedFilter = ''
    if (!canViewAll) {
      params.push(actingUser.id)
      assignedFilter = ` AND (preparer_id = $2 OR reviewer_id = $2)`
    }
    const result = await db.query(
      `SELECT COUNT(*)::int AS count FROM tax_tasks
       WHERE client_id = $1 AND is_deleted = FALSE AND status <> 'completed'${assignedFilter}`,
      params,
    )
    return result.rows[0]?.count ?? 0
  },

  // ── DELETION IMPACT (what a delete would remove) ──
  // Counts every LIVE child row. Deliberately NOT scoped by the caller's
  // VIEW_ALL / VIEW_ASSIGNED task scope: a member who can see 1 of 12 tasks must
  // still be told 12, because 12 is what the button removes. A confirm dialog that
  // under-reports what it is about to do is worse than no dialog.
  //
  // This is the opposite choice to pendingTaskCountFor above, which IS scoped -
  // that one powers the Tasks tab badge, which must match the tab's contents.
  async deletionImpact(actingUser: AuthUser, id: string): Promise<TaxClientDeletionImpact> {
    await this.getById(actingUser, id) // 404s if missing / deleted / outside the caller's firms

    const result = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tax_tasks
            WHERE client_id = $1 AND is_deleted = FALSE) AS tasks,
         (SELECT COUNT(*)::int FROM tax_client_notes
            WHERE client_id = $1 AND is_deleted = FALSE) AS notes,
         (SELECT COUNT(*)::int FROM tax_client_services
            WHERE client_id = $1 AND is_deleted = FALSE) AS services,
         (SELECT COUNT(*)::int FROM tax_client_relationships
            WHERE (client_id = $1 OR related_client_id = $1) AND is_deleted = FALSE) AS relationships,
         (SELECT COUNT(*)::int FROM engagement_letters
            WHERE client_id = $1 AND is_deleted = FALSE) AS engagement_letters,
         (SELECT COUNT(*)::int FROM annual_reviews
            WHERE client_id = $1 AND is_deleted = FALSE) AS annual_reviews`,
      [id],
    )
    return result.rows[0]
  },

  // ── DELETE (soft, cascading) ──
  // Soft-deletes the client and everything belonging to it in ONE transaction.
  // Nothing is physically removed - every row keeps its data and gains is_deleted /
  // deleted_at / deleted_by, so any delete is undone with an UPDATE.
  //
  // NOW() is transaction_timestamp() in PostgreSQL - constant for the whole
  // transaction, not re-evaluated per statement - so every row touched here gets an
  // IDENTICAL deleted_at. That timestamp is effectively a batch id for this delete,
  // which is what lets an undo restore exactly these rows and leave anything deleted
  // earlier, for its own reasons, still deleted.
  //
  // `AND is_deleted = FALSE` on every statement matters: without it an already-
  // deleted child would have its deleted_at / deleted_by overwritten, destroying the
  // record of who removed it and when.
  //
  // tax_task_activity is deliberately NOT touched - migration 025 declares it
  // append-only. An audit trail you can rewrite is not an audit trail.
  async remove(actingUser: AuthUser, id: string): Promise<void> {
    await this.getById(actingUser, id) // 404s if missing / deleted / outside the caller's firms

    const tx = await db.connect()
    try {
      await tx.query('BEGIN')
      const args = [id, actingUser.id]

      // Relationships, BOTH directions. The row is one record shared by two clients;
      // leaving the reverse live would keep a row pointing at a deleted client, and
      // the other client's Relationships tab reads both directions.
      await tx.query(
        `UPDATE tax_client_relationships
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE (client_id = $1 OR related_client_id = $1) AND is_deleted = FALSE`,
        args,
      )
      await tx.query(
        `UPDATE tax_client_services
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE client_id = $1 AND is_deleted = FALSE`,
        args,
      )
      await tx.query(
        `UPDATE tax_client_notes
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE client_id = $1 AND is_deleted = FALSE`,
        args,
      )
      // Task comments. The subquery deliberately does NOT filter tax_tasks on
      // is_deleted, so this is order-independent and also sweeps up comments left on
      // a task that was already deleted individually.
      await tx.query(
        `UPDATE tax_task_comments
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE task_id IN (SELECT id FROM tax_tasks WHERE client_id = $1)
           AND is_deleted = FALSE`,
        args,
      )
      await tx.query(
        `UPDATE tax_tasks
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE client_id = $1 AND is_deleted = FALSE`,
        args,
      )
      // Engagement letter notes, same order-independent subquery shape.
      await tx.query(
        `UPDATE engagement_letter_notes
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE engagement_letter_id IN (SELECT id FROM engagement_letters WHERE client_id = $1)
           AND is_deleted = FALSE`,
        args,
      )
      await tx.query(
        `UPDATE engagement_letters
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE client_id = $1 AND is_deleted = FALSE`,
        args,
      )
      await tx.query(
        `UPDATE annual_reviews
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE client_id = $1 AND is_deleted = FALSE`,
        args,
      )
      await tx.query(
        `UPDATE tax_clients
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
         WHERE id = $1 AND is_deleted = FALSE`,
        args,
      )

      await tx.query('COMMIT')
    } catch (error) {
      await tx.query('ROLLBACK')
      throw error
    } finally {
      tx.release()
    }
  },

  // Existing clients within the member's accessible firms — options for the
  // "related client" picker in the add / edit client form. Firm-scoped like
  // everything else so you can only relate to clients you can actually see.
  async optionsForRelationship(
    actingUser: AuthUser,
  ): Promise<{ items: { id: string; name: string; is_company: boolean }[] }> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) return { items: [] }
    const result = await db.query(
      `SELECT id, name, is_company FROM tax_clients
       WHERE is_deleted = FALSE AND firm_id = ANY($1)
       ORDER BY LOWER(name) ASC`,
      [firmIds],
    )
    return { items: result.rows }
  },

  // Firm-scoped clients + their linked services, for the GLOBAL task-create
  // drawers' client picker (the global Tasks page has no pinned client). Gated on
  // TAX_TASK.CREATE at the route (permission-detached), like the other option
  // routes. Services are embedded so the service drawer can derive frequency
  // without a second round-trip.
  async optionsForTaxTask(actingUser: AuthUser): Promise<{
    items: {
      id: string
      name: string
      services: { id: string; service_id: string; service_name: string; frequency: string }[]
    }[]
  }> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) return { items: [] }
    const result = await db.query(
      `SELECT c.id, c.name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', s.id, 'service_id', s.service_id,
                    'service_name', svc.name, 'frequency', s.frequency
                  ) ORDER BY s.created_at ASC
                ) FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS services
       FROM tax_clients c
       LEFT JOIN tax_client_services s ON s.client_id = c.id AND s.is_deleted = FALSE
       LEFT JOIN services svc ON svc.id = s.service_id
       WHERE c.is_deleted = FALSE AND c.firm_id = ANY($1)
       GROUP BY c.id, c.name
       ORDER BY LOWER(c.name) ASC`,
      [firmIds],
    )
    return { items: result.rows }
  },

  // Relationships shown from BOTH sides (outgoing + incoming), derived by query.
  async relationshipsFor(clientId: string): Promise<RelationshipView[]> {
    const result = await db.query(
      `SELECT r.id, r.relation_type_id, rt.name AS relation_type_name,
              r.related_client_id AS other_client_id, oc.name AS other_client_name,
              'outgoing' AS direction
       FROM tax_client_relationships r
       JOIN relation_types rt ON rt.id = r.relation_type_id
       JOIN tax_clients oc ON oc.id = r.related_client_id AND oc.is_deleted = FALSE
       WHERE r.client_id = $1 AND r.is_deleted = FALSE
       UNION ALL
       SELECT r.id || '-rev', r.relation_type_id, rt.name AS relation_type_name,
              r.client_id AS other_client_id, oc.name AS other_client_name,
              'incoming' AS direction
       FROM tax_client_relationships r
       JOIN relation_types rt ON rt.id = r.relation_type_id
       JOIN tax_clients oc ON oc.id = r.client_id AND oc.is_deleted = FALSE
       WHERE r.related_client_id = $1 AND r.is_deleted = FALSE`,
      [clientId],
    )
    return result.rows
  },

  async servicesFor(clientId: string): Promise<ServiceView[]> {
    const result = await db.query(
      `SELECT s.id, s.service_id, svc.name AS service_name, svc.code AS service_code,
              s.frequency, s.short_description,
              s.assignee_id,
              CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS assignee_name
       FROM tax_client_services s
       JOIN services svc ON svc.id = s.service_id
       LEFT JOIN members a ON a.id = s.assignee_id
       WHERE s.client_id = $1 AND s.is_deleted = FALSE
       ORDER BY s.created_at ASC`,
      [clientId],
    )
    return result.rows
  },

  // Sensitive-typed notes are excluded entirely unless the caller is permitted.
  async notesFor(clientId: string, canSeeSensitive: boolean): Promise<NoteView[]> {
    const sensitiveFilter = canSeeSensitive ? '' : 'AND nt.is_sensitive = FALSE'
    const result = await db.query(
      `SELECT n.id, n.note_type_id, nt.name AS note_type_name, nt.is_sensitive,
              n.text, n.created_by,
              CASE WHEN cb.id IS NULL THEN NULL ELSE cb.first_name || ' ' || cb.last_name END AS created_by_name,
              n.created_at
       FROM tax_client_notes n
       JOIN note_types nt ON nt.id = n.note_type_id
       LEFT JOIN members cb ON cb.id = n.created_by
       WHERE n.client_id = $1 AND n.is_deleted = FALSE ${sensitiveFilter}
       ORDER BY n.created_at DESC`,
      [clientId],
    )
    return result.rows
  },

  // ── Validation helpers ──

  async assertFirmAccessible(actingUser: AuthUser, firmId: string): Promise<void> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (!firmIds.includes(firmId)) {
      throw new AppError(taxClientMessages.FIRM_NOT_ACCESSIBLE, HTTP_STATUS.FORBIDDEN)
    }
  },

  // A generic "row exists and is not soft-deleted" check for a master reference.
  async assertRefExists(
    table: string,
    id: string | null | undefined,
    message: string,
  ): Promise<void> {
    if (!id) return
    const result = await db.query(
      `SELECT id FROM ${table} WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(message, HTTP_STATUS.BAD_REQUEST)
    }
  },

  async assertMemberExists(id: string | null | undefined): Promise<void> {
    if (!id) return
    const result = await db.query(
      `SELECT id FROM members WHERE id = $1 AND is_deleted = FALSE`,
      [id],
    )
    if (result.rows.length === 0) {
      throw new AppError(taxClientMessages.ASSIGNEE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
  },

  // Validate the core master references on a create/update payload.
  async assertCoreRefs(data: CreateTaxClientRequest | UpdateTaxClientRequest): Promise<void> {
    await this.assertRefExists('entity_types', data.entity_type_id, taxClientMessages.ENTITY_TYPE_NOT_FOUND)
    await this.assertRefExists('client_groups', data.client_group_id, taxClientMessages.CLIENT_GROUP_NOT_FOUND)
    await this.assertRefExists('software', data.software_id, taxClientMessages.SOFTWARE_NOT_FOUND)
    await this.assertMemberExists(data.assignee_id)
  },

  // Validate nested children before inserting them.
  async assertChildrenValid(data: CreateTaxClientRequest): Promise<void> {
    // Relationships: relation type + related client must exist (not deleted).
    for (const rel of data.relationships) {
      await this.assertRefExists('relation_types', rel.relation_type_id, taxClientMessages.RELATION_TYPE_NOT_FOUND)
      const rc = await db.query(
        `SELECT id FROM tax_clients WHERE id = $1 AND is_deleted = FALSE`,
        [rel.related_client_id],
      )
      if (rc.rows.length === 0) {
        throw new AppError(taxClientMessages.RELATED_CLIENT_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
      }
    }

    // Services: service must exist AND the chosen frequency must be one it supports.
    for (const svc of data.services) {
      const s = await db.query(
        `SELECT frequencies FROM services WHERE id = $1 AND is_deleted = FALSE`,
        [svc.service_id],
      )
      if (s.rows.length === 0) {
        throw new AppError(taxClientMessages.SERVICE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
      }
      const allowed: string[] = s.rows[0].frequencies || []
      if (!allowed.includes(svc.frequency)) {
        throw new AppError(taxClientMessages.SERVICE_FREQUENCY_INVALID, HTTP_STATUS.BAD_REQUEST)
      }
      await this.assertMemberExists(svc.assignee_id)
    }

    // Notes: note type must exist.
    for (const note of data.notes) {
      await this.assertRefExists('note_types', note.note_type_id, taxClientMessages.NOTE_TYPE_NOT_FOUND)
    }
  },

  // Insert a client and its children inside a transaction the CALLER owns, and
  // return the new id. Extracted from create() so the CSV importer can put many
  // clients in ONE transaction; create() still opens its own and behaves exactly
  // as it always has. `importBatchId` is NULL for everything except a CSV import.
  //
  // Reference validation is NOT done here - the caller does it before opening the
  // transaction (create() via assertCoreRefs / assertChildrenValid, the importer
  // via the CSV service), so a rejected payload never holds a transaction open.
  async insertClientWithin(
    tx: PoolClient,
    actingUser: AuthUser,
    data: CreateTaxClientRequest,
    importBatchId: string | null = null,
  ): Promise<string> {
    const inserted = await tx.query(
      `INSERT INTO tax_clients (
         firm_id, name, is_company, gender, title, entity_type_id,
         dob_or_incorporation_date, abn, acn, trading_name,
         address_line, locality, state, state_code, postcode,
         bank_account_name, bank_account_prefix, bank_account_number,
         director_id, client_group_id, software_id, assignee_id, status,
         email, import_batch_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING id`,
      [
        data.firm_id,
        data.name,
        data.is_company,
        data.gender ?? null,
        data.title ?? null,
        data.entity_type_id ?? null,
        data.dob_or_incorporation_date ?? null,
        data.abn ?? null,
        data.acn ?? null,
        data.trading_name ?? null,
        data.address_line ?? null,
        data.locality ?? null,
        // State is stored as both the full name (derived) and the code.
        australianStateName(data.state_code),
        data.state_code ?? null,
        data.postcode ?? null,
        data.bank_account_name ?? null,
        data.bank_account_prefix ?? null,
        data.bank_account_number ?? null,
        data.director_id ?? null,
        data.client_group_id ?? null,
        data.software_id ?? null,
        data.assignee_id ?? null,
        data.status,
        data.email ?? null,
        importBatchId,
      ],
    )
    const clientId = inserted.rows[0].id as string

    for (const rel of data.relationships) {
      await tx.query(
        `INSERT INTO tax_client_relationships (client_id, relation_type_id, related_client_id)
         VALUES ($1, $2, $3)`,
        [clientId, rel.relation_type_id, rel.related_client_id],
      )
    }
    for (const svc of data.services) {
      await tx.query(
        `INSERT INTO tax_client_services (client_id, service_id, frequency, short_description, assignee_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [clientId, svc.service_id, svc.frequency, svc.short_description ?? null, svc.assignee_id ?? null],
      )
    }
    // Auto-attach any `auto_added` services (e.g. a one-time service) that the
    // user didn't already pick, so every new client has them without setup.
    // Imported clients go through this identically.
    await this.attachAutoAddedServices(
      tx,
      clientId,
      data.services.map((s) => s.service_id),
    )
    for (const note of data.notes) {
      await tx.query(
        `INSERT INTO tax_client_notes (client_id, note_type_id, text, created_by)
         VALUES ($1, $2, $3, $4)`,
        [clientId, note.note_type_id, note.text, actingUser.id],
      )
    }

    return clientId
  },

  // ── CREATE (client + nested children, one transaction) ──
  async create(actingUser: AuthUser, data: CreateTaxClientRequest): Promise<TaxClientDetail> {
    await this.assertFirmAccessible(actingUser, data.firm_id)
    await this.assertCoreRefs(data)
    await this.assertChildrenValid(data)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const clientId = await this.insertClientWithin(client, actingUser, data)
      await client.query('COMMIT')

      // Generate this client's annual review row now, so a newly added client shows
      // on the Annual Review page instantly rather than waiting for Sunday's sweep.
      // Deliberately AFTER the commit and fully wrapped: the client is already saved
      // at this point, and a failure here must never turn a successful save into an
      // error for the user. The weekly sweep will pick up anything missed.
      try {
        await annualReviewService.syncClient(clientId)
      } catch (err) {
        console.error('[annual-review] syncClient after client create failed', err)
      }

      return this.getById(actingUser, clientId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // Attach every `auto_added` tax-practice service to a newly created client,
  // skipping any the user already picked (no duplicates). Each is stored at a
  // single frequency — the first in canonical order (for a one-time service that
  // is simply 'one_time'). Runs inside the create transaction.
  async attachAutoAddedServices(
    client: PoolClient,
    clientId: string,
    chosenServiceIds: string[],
  ): Promise<void> {
    const flagged = await client.query(
      `SELECT id, frequencies FROM services
       WHERE is_deleted = FALSE AND auto_added = TRUE AND department = 'tax_practice'`,
    )
    for (const svc of flagged.rows) {
      if (chosenServiceIds.includes(svc.id)) continue
      const frequency = this.pickAutoAddedFrequency(svc.frequencies ?? [])
      if (!frequency) continue // misconfigured service (no frequencies) — skip safely
      await client.query(
        `INSERT INTO tax_client_services (client_id, service_id, frequency)
         VALUES ($1, $2, $3)`,
        [clientId, svc.id, frequency],
      )
    }
  },

  // An auto-added service is stored at ONE frequency; pick the first in canonical
  // order (yearly … one_time). Returns null if the service carries none.
  pickAutoAddedFrequency(frequencies: string[]): string | null {
    return SERVICE_FREQUENCY_VALUES.find((f) => frequencies.includes(f)) ?? null
  },

  // Validate child collections supplied on update: refs exist, service
  // frequency is valid, related clients are real/accessible/not-self, and any
  // row carrying an id genuinely belongs to this client.
  async assertUpdateChildrenValid(
    actingUser: AuthUser,
    clientId: string,
    data: UpdateTaxClientRequest,
  ): Promise<void> {
    if (data.relationships !== undefined) {
      const firmIds = await this.accessibleFirmIds(actingUser.id)
      for (const rel of data.relationships) {
        await this.assertRefExists('relation_types', rel.relation_type_id, taxClientMessages.RELATION_TYPE_NOT_FOUND)
        if (rel.related_client_id === clientId) {
          throw new AppError(taxClientMessages.RELATED_CLIENT_SELF, HTTP_STATUS.BAD_REQUEST)
        }
        const rc = await db.query(
          `SELECT firm_id FROM tax_clients WHERE id = $1 AND is_deleted = FALSE`,
          [rel.related_client_id],
        )
        // Unknown, or in a firm this member can't see — don't reveal which.
        if (rc.rows.length === 0 || !firmIds.includes(rc.rows[0].firm_id)) {
          throw new AppError(taxClientMessages.RELATED_CLIENT_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
        }
        if (rel.id) await this.assertChildBelongs('tax_client_relationships', rel.id, clientId)
      }
    }

    if (data.services !== undefined) {
      for (const svc of data.services) {
        const s = await db.query(
          `SELECT frequencies FROM services WHERE id = $1 AND is_deleted = FALSE`,
          [svc.service_id],
        )
        if (s.rows.length === 0) {
          throw new AppError(taxClientMessages.SERVICE_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
        }
        const allowed: string[] = s.rows[0].frequencies || []
        if (!allowed.includes(svc.frequency)) {
          throw new AppError(taxClientMessages.SERVICE_FREQUENCY_INVALID, HTTP_STATUS.BAD_REQUEST)
        }
        await this.assertMemberExists(svc.assignee_id)
        if (svc.id) await this.assertChildBelongs('tax_client_services', svc.id, clientId)
      }
    }

    if (data.notes !== undefined) {
      for (const note of data.notes) {
        await this.assertRefExists('note_types', note.note_type_id, taxClientMessages.NOTE_TYPE_NOT_FOUND)
      }
    }
  },

  // A relationship/service row referenced by id on update must belong to this
  // client and still be live — otherwise reject rather than silently no-op.
  // `table` is an internal literal, never user input.
  async assertChildBelongs(table: string, id: string, clientId: string): Promise<void> {
    const r = await db.query(
      `SELECT 1 FROM ${table} WHERE id = $1 AND client_id = $2 AND is_deleted = FALSE`,
      [id, clientId],
    )
    if (r.rows.length === 0) {
      throw new AppError(taxClientMessages.CHILD_NOT_FOUND, HTTP_STATUS.BAD_REQUEST)
    }
  },

  // ── UPDATE (core fields + optional child reconciliation, one transaction) ──
  // Relationships & services are reconciled by id (keep / update-in-place /
  // soft-delete the removed); notes are append-only. A collection left
  // undefined is not touched.
  async update(
    actingUser: AuthUser,
    id: string,
    data: UpdateTaxClientRequest,
  ): Promise<TaxClientDetail> {
    // 404s if missing or outside the member's accessible firms.
    await this.getById(actingUser, id)

    // Moving to a different firm is allowed only to another accessible firm.
    if (data.firm_id !== undefined) {
      await this.assertFirmAccessible(actingUser, data.firm_id)
    }
    await this.assertCoreRefs(data)
    await this.assertUpdateChildrenValid(actingUser, id, data)

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      // Core fields — only those explicitly provided.
      const updates: string[] = []
      const values: any[] = []
      let i = 1
      const set = (col: string, val: any) => {
        updates.push(`${col} = $${i++}`)
        values.push(val)
      }

      if (data.firm_id !== undefined) set('firm_id', data.firm_id)
      if (data.name !== undefined) set('name', data.name)
      if (data.is_company !== undefined) set('is_company', data.is_company)
      if (data.gender !== undefined) set('gender', data.gender ?? null)
      if (data.title !== undefined) set('title', data.title ?? null)
      if (data.entity_type_id !== undefined) set('entity_type_id', data.entity_type_id ?? null)
      if (data.dob_or_incorporation_date !== undefined) set('dob_or_incorporation_date', data.dob_or_incorporation_date ?? null)
      if (data.abn !== undefined) set('abn', data.abn ?? null)
      if (data.acn !== undefined) set('acn', data.acn ?? null)
      if (data.trading_name !== undefined) set('trading_name', data.trading_name ?? null)
      if (data.address_line !== undefined) set('address_line', data.address_line ?? null)
      if (data.locality !== undefined) set('locality', data.locality ?? null)
      // State code + derived full name are kept in sync.
      if (data.state_code !== undefined) {
        set('state', australianStateName(data.state_code))
        set('state_code', data.state_code ?? null)
      }
      if (data.postcode !== undefined) set('postcode', data.postcode ?? null)
      if (data.email !== undefined) set('email', data.email ?? null)
      if (data.bank_account_name !== undefined) set('bank_account_name', data.bank_account_name ?? null)
      if (data.bank_account_prefix !== undefined) set('bank_account_prefix', data.bank_account_prefix ?? null)
      if (data.bank_account_number !== undefined) set('bank_account_number', data.bank_account_number ?? null)
      if (data.director_id !== undefined) set('director_id', data.director_id ?? null)
      if (data.client_group_id !== undefined) set('client_group_id', data.client_group_id ?? null)
      if (data.software_id !== undefined) set('software_id', data.software_id ?? null)
      if (data.assignee_id !== undefined) set('assignee_id', data.assignee_id ?? null)
      if (data.status !== undefined) set('status', data.status)

      if (updates.length > 0) {
        values.push(id)
        await client.query(`UPDATE tax_clients SET ${updates.join(', ')} WHERE id = $${i}`, values)
      }

      // Relationships — reconcile the outgoing set by id.
      if (data.relationships !== undefined) {
        const keepIds = data.relationships.filter((r) => r.id).map((r) => r.id as string)
        await client.query(
          `UPDATE tax_client_relationships
           SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1
           WHERE client_id = $2 AND is_deleted = FALSE AND NOT (id = ANY($3::text[]))`,
          [actingUser.id, id, keepIds],
        )
        for (const rel of data.relationships.filter((r) => !r.id)) {
          await client.query(
            `INSERT INTO tax_client_relationships (client_id, relation_type_id, related_client_id)
             VALUES ($1, $2, $3)`,
            [id, rel.relation_type_id, rel.related_client_id],
          )
        }
      }

      // Services — reconcile by id; existing rows update in place.
      if (data.services !== undefined) {
        const keepIds = data.services.filter((s) => s.id).map((s) => s.id as string)
        await client.query(
          `UPDATE tax_client_services
           SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1
           WHERE client_id = $2 AND is_deleted = FALSE AND NOT (id = ANY($3::text[]))`,
          [actingUser.id, id, keepIds],
        )
        for (const svc of data.services) {
          if (svc.id) {
            await client.query(
              `UPDATE tax_client_services
               SET service_id = $1, frequency = $2, short_description = $3, assignee_id = $4
               WHERE id = $5 AND client_id = $6 AND is_deleted = FALSE`,
              [svc.service_id, svc.frequency, svc.short_description ?? null, svc.assignee_id ?? null, svc.id, id],
            )
          } else {
            await client.query(
              `INSERT INTO tax_client_services (client_id, service_id, frequency, short_description, assignee_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [id, svc.service_id, svc.frequency, svc.short_description ?? null, svc.assignee_id ?? null],
            )
          }
        }
      }

      // Notes — append-only; existing notes are never modified.
      if (data.notes !== undefined) {
        for (const note of data.notes) {
          await client.query(
            `INSERT INTO tax_client_notes (client_id, note_type_id, text, created_by)
             VALUES ($1, $2, $3, $4)`,
            [id, note.note_type_id, note.text, actingUser.id],
          )
        }
      }

      await client.query('COMMIT')

      // Keep the annual review row in step if the entity type, incorporation date or
      // status changed. Corrects the current year onward only — past years keep the
      // date they were generated with, deliberately. Same guarantee as create: this
      // can never turn a successful save into an error.
      try {
        await annualReviewService.syncClient(id)
      } catch (err) {
        console.error('[annual-review] syncClient after client update failed', err)
      }

      return this.getById(actingUser, id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },

  // ── CSV EXPORT (read-only) ──
  // Every client matching the CURRENT list filters, not "everything", so an
  // export is the file version of what the user is looking at. Same firm scoping
  // as list(); no pagination; sorted by name like the list's default.
  //
  // Client group, assignee and status are still FILTERS here even though none of
  // them is a column in the file - you can export one group, or only inactive
  // clients, and the file itself stays re-importable.
  async exportRows(actingUser: AuthUser, q: ExportTaxClientsQuery): Promise<ExportRow[]> {
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    if (firmIds.length === 0) return []

    const params: any[] = [firmIds]
    // Filters are multi-value: `= ANY($n)` with a string[] param. csvOf never
    // yields an empty array, so a falsy check still means "no filter".
    const where: string[] = ['c.is_deleted = FALSE', 'c.firm_id = ANY($1)']

    if (q.firm_id) {
      params.push(q.firm_id)
      where.push(`c.firm_id = ANY($${params.length})`)
    }
    if (q.entity_type_id) {
      params.push(q.entity_type_id)
      where.push(`c.entity_type_id = ANY($${params.length})`)
    }
    if (q.client_group_id) {
      params.push(q.client_group_id)
      where.push(`c.client_group_id = ANY($${params.length})`)
    }
    if (q.software_id) {
      params.push(q.software_id)
      where.push(`c.software_id = ANY($${params.length})`)
    }
    if (q.status) {
      params.push(q.status)
      where.push(`c.status = ANY($${params.length})`)
    }
    if (q.search) {
      params.push(`%${q.search}%`)
      where.push(`c.name ILIKE $${params.length}`)
    }

    const result = await db.query(
      `SELECT f.name AS firm_name,
              et.name AS entity_type_name,
              sw.name AS software_name,
              c.name, c.is_company, c.title, c.gender,
              c.dob_or_incorporation_date,
              c.trading_name, c.abn, c.acn, c.director_id,
              c.address_line, c.locality, c.state_code, c.postcode, c.email,
              c.bank_account_name, c.bank_account_prefix, c.bank_account_number
       FROM tax_clients c
       LEFT JOIN firms f ON f.id = c.firm_id
       LEFT JOIN entity_types et ON et.id = c.entity_type_id
       LEFT JOIN software sw ON sw.id = c.software_id
       WHERE ${where.join(' AND ')}
       ORDER BY LOWER(c.name) ASC`,
      params,
    )
    return result.rows as ExportRow[]
  },

  // ── CSV IMPORT (create only) ──
  // Rows arrive already validated by the CSV service. Everything goes in ONE
  // transaction: any failure on any row rolls the whole file back, so the user
  // never has to work out which half of a file went in.
  async importRows(actingUser: AuthUser, rows: ImportableClient[]): Promise<ImportResult> {
    // Belt and braces. The CSV service only ever resolves a firm NAME to a firm
    // this member can access, so this should be unreachable - but the check is
    // cheap and the alternative is writing a client into someone else's firm.
    const firmIds = await this.accessibleFirmIds(actingUser.id)
    for (const row of rows) {
      if (!firmIds.includes(row.firm_id)) {
        throw new AppError(taxClientMessages.FIRM_NOT_ACCESSIBLE, HTTP_STATUS.FORBIDDEN)
      }
    }

    const client = await db.connect()
    const createdIds: string[] = []
    let batchId = ''
    try {
      await client.query('BEGIN')

      // One id for the whole file - the handle that makes a mistaken import
      // undoable with a single UPDATE. generate_ulid() is the same DB function
      // every table's primary key already defaults to.
      const batch = await client.query(`SELECT generate_ulid() AS id`)
      batchId = batch.rows[0].id as string

      for (const row of rows) {
        // Imported clients go through the SAME insert Add client uses, so they
        // pick up `auto_added` services identically. The file cannot carry the
        // Classification fields, so every row is created ungrouped, unassigned
        // and Active - and has no relationships, services or notes of its own.
        const id = await this.insertClientWithin(
          client,
          actingUser,
          {
            ...row,
            client_group_id: null,
            assignee_id: null,
            status: 'active',
            relationships: [],
            services: [],
            notes: [],
          },
          batchId,
        )
        createdIds.push(id)
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    // AFTER the commit, and each one wrapped, exactly as create() does: the
    // clients are already saved, and a broken annual review must never turn a
    // successful import into an error. Sunday's sweep picks up anything missed.
    for (const id of createdIds) {
      try {
        await annualReviewService.syncClient(id)
      } catch (err) {
        console.error('[annual-review] syncClient after client import failed', err)
      }
    }

    return { imported: createdIds.length, batch_id: batchId }
  },
}
