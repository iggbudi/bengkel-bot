/**
 * Admin Authentication & Session Management
 * -------------------------------------------
 * Simple cookie-based session with in-memory store.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export interface AdminSession {
  id: string
  username: string
  createdAt: number
}

const SESSION_TTL = 24 * 60 * 60 * 1000 // 24 hours
const sessions = new Map<string, AdminSession>()
const COOKIE_NAME = 'bengkelbot.sid'

function cleanExpired(): void {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) sessions.delete(id)
  }
}

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'Unisbank1920',
  }
}

export function createSession(username: string): AdminSession {
  cleanExpired()
  const session: AdminSession = {
    id: randomUUID(),
    username,
    createdAt: Date.now(),
  }
  sessions.set(session.id, session)
  return session
}

export function getSession(req: IncomingMessage): AdminSession | null {
  const cookie = req.headers.cookie ?? ''
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  if (!match) return null
  const session = sessions.get(match[1])
  if (!session || Date.now() - session.createdAt > SESSION_TTL) {
    if (session) sessions.delete(match[1])
    return null
  }
  return session
}

export function destroySession(req: IncomingMessage): void {
  const cookie = req.headers.cookie ?? ''
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  if (match) sessions.delete(match[1])
}

export function setSessionCookie(res: ServerResponse, session: AdminSession): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${session.id}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}`)
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`)
}

export function requireAuth(req: IncomingMessage, res: ServerResponse): AdminSession | null {
  const session = getSession(req)
  if (!session) {
    res.writeHead(302, { Location: '/admin/login' })
    res.end()
    return null
  }
  return session
}
