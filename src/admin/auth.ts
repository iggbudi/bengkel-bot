/**
 * Admin Authentication — cookie helpers + session/CSRF gate.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createSession,
  deleteSession,
  getSessionById,
  pruneExpiredSessions,
  verifyCsrfToken,
  type AdminSession,
} from './sessions.js'

export type { AdminSession } from './sessions.js'
export {
  warnIfInsecureAdminCredentials,
  verifyAdminLogin,
  hashAdminPassword,
  getAdminUsername,
} from './password.js'

const COOKIE_NAME = 'bengkelbot.sid'

export function initAdminAuth(): void {
  pruneExpiredSessions()
}

function parseSessionId(req: IncomingMessage): string | null {
  const cookie = req.headers.cookie ?? ''
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return match?.[1] ?? null
}

export function getSession(req: IncomingMessage): AdminSession | null {
  const id = parseSessionId(req)
  if (!id) return null
  return getSessionById(id)
}

export function destroySession(req: IncomingMessage): void {
  const id = parseSessionId(req)
  if (id) deleteSession(id)
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

export function setSessionCookie(
  res: ServerResponse,
  session: AdminSession,
  req: IncomingMessage,
): void {
  const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
  res.setHeader('Set-Cookie', buildCookie(session.id, req, maxAge))
}

export function clearSessionCookie(res: ServerResponse, req: IncomingMessage): void {
  res.setHeader('Set-Cookie', buildCookie('', req, 0))
}

export function getCsrfTokenFromRequest(req: IncomingMessage): string | null {
  const header = req.headers['x-csrf-token']
  if (typeof header === 'string' && header.trim()) return header.trim()
  return null
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

export function requireAuthWithCsrf(
  req: IncomingMessage,
  res: ServerResponse,
): AdminSession | null {
  const session = requireAuth(req, res)
  if (!session) return null

  const csrf = getCsrfTokenFromRequest(req)
  if (!verifyCsrfToken(session, csrf)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'CSRF token tidak valid' }))
    return null
  }

  return session
}

export { createSession }