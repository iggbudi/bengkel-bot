/**
 * Admin sessions persisted in SQLite (survives PM2 restart).
 */

import { randomUUID } from 'node:crypto'
import { getDb } from '../db/schema.js'

export interface AdminSession {
  id: string
  username: string
  csrfToken: string
  createdAt: number
  expiresAt: number
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

export function getSessionTtlMs(): number {
  return SESSION_TTL_MS
}

export function pruneExpiredSessions(): void {
  getDb().prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now())
}

function rowToSession(row: {
  id: string
  username: string
  csrf_token: string
  created_at: number
  expires_at: number
}): AdminSession {
  return {
    id: row.id,
    username: row.username,
    csrfToken: row.csrf_token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

export function createSession(username: string): AdminSession {
  pruneExpiredSessions()
  const now = Date.now()
  const session: AdminSession = {
    id: randomUUID(),
    username,
    csrfToken: randomUUID(),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }

  getDb()
    .prepare(
      `INSERT INTO admin_sessions (id, username, csrf_token, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(session.id, session.username, session.csrfToken, session.createdAt, session.expiresAt)

  return session
}

export function getSessionById(id: string): AdminSession | null {
  pruneExpiredSessions()
  const row = getDb()
    .prepare(
      `SELECT id, username, csrf_token, created_at, expires_at
       FROM admin_sessions WHERE id = ? AND expires_at > ?`,
    )
    .get(id, Date.now()) as
    | {
        id: string
        username: string
        csrf_token: string
        created_at: number
        expires_at: number
      }
    | undefined

  return row ? rowToSession(row) : null
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM admin_sessions WHERE id = ?').run(id)
}

export function verifyCsrfToken(session: AdminSession, token: string | null | undefined): boolean {
  if (!token) return false
  return token === session.csrfToken
}