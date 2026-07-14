import type { PoolClient } from 'pg'
import { db } from '../../../lib/db'
import { taxClientMessages } from '../config/tax-clients.messages'
import { AppError } from '../../../utils/app-error'
import { HTTP_STATUS } from '../../../config/constants'
import { PERMISSIONS } from '../../../config/permissions.constants'
import { SERVICE_FREQUENCY_VALUES } from '../../../config/service-frequencies.constants'
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
    const where: string[] = ['c.is_deleted = FALSE', 'c.firm_id = ANY($1)']

    if (q.firm_id) {
      params.push(q.firm_id)
      where.push(`c.firm_id = $${params.length}`)
    }
    if (q.entity_type_id) {
      params.push(q.entity_type_id)
      where.push(`c.entity_type_id = $${params.length}`)
    }
    if (q.client_group_id) {
      params.push(q.client_group_id)
      where.push(`c.client_group_id = $${params.length}`)
    }
    if (q.status) {
      params.push(q.status)
      where.push(`c.status = $${params.length}`)
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
              CASE WHEN a.id IS NULL THEN NULL ELSE a.first_name || ' ' || a.last_name END AS assignee_name
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

    const [relationships, services, notes] = await Promise.all([
      this.relationshipsFor(id),
      this.servicesFor(id),
      this.notesFor(id, canSeeSensitive),
    ])

    return { ...row, relationships, services, notes }
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

  // ── CREATE (client + nested children, one transaction) ──
  async create(actingUser: AuthUser, data: CreateTaxClientRequest): Promise<TaxClientDetail> {
    await this.assertFirmAccessible(actingUser, data.firm_id)
    await this.assertCoreRefs(data)
    await this.assertChildrenValid(data)

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const inserted = await client.query(
        `INSERT INTO tax_clients (
           firm_id, name, is_company, gender, title, entity_type_id,
           dob_or_incorporation_date, abn, acn, trading_name,
           bank_account_name, bank_account_prefix, bank_account_number,
           director_id, client_group_id, software_id, assignee_id, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
          data.bank_account_name ?? null,
          data.bank_account_prefix ?? null,
          data.bank_account_number ?? null,
          data.director_id ?? null,
          data.client_group_id ?? null,
          data.software_id ?? null,
          data.assignee_id ?? null,
          data.status,
        ],
      )
      const clientId = inserted.rows[0].id as string

      for (const rel of data.relationships) {
        await client.query(
          `INSERT INTO tax_client_relationships (client_id, relation_type_id, related_client_id)
           VALUES ($1, $2, $3)`,
          [clientId, rel.relation_type_id, rel.related_client_id],
        )
      }
      for (const svc of data.services) {
        await client.query(
          `INSERT INTO tax_client_services (client_id, service_id, frequency, short_description, assignee_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [clientId, svc.service_id, svc.frequency, svc.short_description ?? null, svc.assignee_id ?? null],
        )
      }
      // Auto-attach any `auto_added` services (e.g. a one-time service) that the
      // user didn't already pick, so every new client has them without setup.
      await this.attachAutoAddedServices(
        client,
        clientId,
        data.services.map((s) => s.service_id),
      )
      for (const note of data.notes) {
        await client.query(
          `INSERT INTO tax_client_notes (client_id, note_type_id, text, created_by)
           VALUES ($1, $2, $3, $4)`,
          [clientId, note.note_type_id, note.text, actingUser.id],
        )
      }

      await client.query('COMMIT')
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
      return this.getById(actingUser, id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },
}
