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

const DEFAULT_ADMIN_PASSWORD = 'Unisbank1920'

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
  }
}

export function isDefaultAdminPassword(): boolean {
  const password = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD
  return password === DEFAULT_ADMIN_PASSWORD
}

export function warnIfInsecureAdminCredentials(): void {
  if (process.env.NODE_ENV === 'production' && isDefaultAdminPassword()) {
    console.warn(
      '[SECURITY] ADMIN_PASSWORD masih default — segera set password kuat di .env',
    )
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

function isSecureRequest(req: IncomingMessage): boolean {
  const proto = req.headers['x-forwarded-proto']
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') return true
  return process.env.NODE_ENV === 'production'
}

function buildCookie(value: string, req: IncomingMessage, maxAge: number): string {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`
}

export function setSessionCookie(res: ServerResponse, session: AdminSession, req: IncomingMessage): void {
  res.setHeader('Set-Cookie', buildCookie(session.id, req, SESSION_TTL / 1000))
}

export function clearSessionCookie(res: ServerResponse, req: IncomingMessage): void {
  res.setHeader('Set-Cookie', buildCookie('', req, 0))
}

export function requireAuth(req: IncomingMessage, res: ServerResponse): AdminSession | null {
  const session = getSession(req)
  if (!session) {
    const isApi = (req.url ?? '').startsWith('/admin/api/')
    if (isApi) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
    } else {
      res.writeHead(302, { Location: '/admin/login' })
      res.end()
    }
    return null
  }
  return session
}
