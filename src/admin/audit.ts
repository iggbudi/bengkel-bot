/**
 * Admin audit log — persisted in SQLite.
 */

import { randomUUID } from 'node:crypto'
import { getDb } from '../db/schema.js'

export type AdminAuditAction =
  | 'login'
  | 'logout'
  | 'kb.update'
  | 'booking.update'
  | 'settings.update'

export function logAdminAction(
  username: string | null,
  action: AdminAuditAction,
  detail?: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO admin_audit_log (id, username, action, detail)
       VALUES (?, ?, ?, ?)`,
    )
    .run(randomUUID(), username, action, detail ?? null)
}

export function listRecentAuditLogs(limit = 50): Array<{
  id: string
  username: string | null
  action: string
  detail: string | null
  created_at: string
}> {
  return getDb()
    .prepare(
      `SELECT id, username, action, detail, created_at
       FROM admin_audit_log
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string
    username: string | null
    action: string
    detail: string | null
    created_at: string
  }>
}