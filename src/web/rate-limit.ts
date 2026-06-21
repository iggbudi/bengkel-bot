/**
 * In-memory sliding-window rate limiter per client IP.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

interface RateLimitEntry {
  timestamps: number[]
}

const buckets = new Map<string, RateLimitEntry>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup(windowMs: number): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)
    if (entry.timestamps.length === 0) buckets.delete(key)
  }
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'unknown'
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000,
): RateLimitResult {
  cleanup(windowMs)
  const now = Date.now()
  const entry = buckets.get(key) ?? { timestamps: [] }
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0] ?? now
    const retryAfterSec = Math.ceil((windowMs - (now - oldest)) / 1000)
    buckets.set(key, entry)
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) }
  }

  entry.timestamps.push(now)
  buckets.set(key, entry)
  return { allowed: true, remaining: limit - entry.timestamps.length, retryAfterSec: 0 }
}

export function applyRateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number,
  windowMs: number = 60_000,
): RateLimitResult | null {
  const ip = getClientIp(req)
  const result = checkRateLimit(ip, limit, windowMs)

  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))

  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSec))
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        error: 'Terlalu banyak permintaan. Coba lagi dalam beberapa saat.',
        retryAfter: result.retryAfterSec,
      }),
    )
    return null
  }

  return result
}

export function getChatRateLimit(): number {
  const n = Number(process.env.RATE_LIMIT_CHAT_PER_MIN ?? 20)
  return Number.isFinite(n) && n > 0 ? n : 20
}

export function getTokenRateLimit(): number {
  const n = Number(process.env.RATE_LIMIT_TOKEN_PER_MIN ?? 30)
  return Number.isFinite(n) && n > 0 ? n : 30
}