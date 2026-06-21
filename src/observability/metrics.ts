/**
 * Chat/LLM metrics — daily aggregates + recent request log in SQLite.
 */

import { randomUUID } from 'node:crypto'
import { getDb } from '../db/schema.js'
import { logChatRequest, type ChatRequestLogEntry, type ChatRequestStatus } from './request-log.js'
import { getUptimeSeconds } from './uptime.js'

export interface RecordChatRequestInput {
  chatId: string
  channel: string
  durationMs: number
  status: ChatRequestStatus
  errorMessage?: string
  tokens?: number | null
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function recordChatRequest(input: RecordChatRequestInput): void {
  const entry: ChatRequestLogEntry = {
    type: 'chat_request',
    chatId: input.chatId,
    channel: input.channel,
    durationMs: input.durationMs,
    status: input.status,
    error: input.errorMessage,
    tokens: input.tokens ?? null,
  }
  logChatRequest(entry)

  const db = getDb()
  const isError = input.status === 'error' || input.status === 'timeout'

  db.prepare(
    `INSERT INTO chat_request_log (id, chat_id, channel, duration_ms, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.chatId,
    input.channel,
    input.durationMs,
    input.status,
    input.errorMessage ?? null,
  )

  db.prepare(
    `INSERT INTO llm_usage_daily (date, channel, requests, errors, total_duration_ms)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(date, channel) DO UPDATE SET
       requests = requests + 1,
       errors = errors + excluded.errors,
       total_duration_ms = total_duration_ms + excluded.total_duration_ms`,
  ).run(todayDate(), input.channel, isError ? 1 : 0, input.durationMs)

  pruneOldRequestLogs()
}

function pruneOldRequestLogs(): void {
  const keepDays = Number(process.env.METRICS_LOG_RETENTION_DAYS ?? 7)
  if (!Number.isFinite(keepDays) || keepDays <= 0) return
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString()
  getDb().prepare('DELETE FROM chat_request_log WHERE created_at < ?').run(cutoff)
}

export function getChatMetrics(): {
  uptimeSeconds: number
  today: {
    date: string
    requests: number
    errors: number
    errorRate: number
    avgLatencyMs: number
    byChannel: Array<{ channel: string; requests: number; errors: number }>
  }
  last7Days: Array<{
    date: string
    requests: number
    errors: number
    avgLatencyMs: number
  }>
  recentRequests: Array<{
    chat_id: string | null
    channel: string
    duration_ms: number
    status: string
    created_at: string
  }>
} {
  const db = getDb()
  const date = todayDate()

  const todayRows = db
    .prepare(
      `SELECT channel, requests, errors, total_duration_ms
       FROM llm_usage_daily WHERE date = ?`,
    )
    .all(date) as Array<{
    channel: string
    requests: number
    errors: number
    total_duration_ms: number
  }>

  const totalRequests = todayRows.reduce((s, r) => s + r.requests, 0)
  const totalErrors = todayRows.reduce((s, r) => s + r.errors, 0)
  const totalDuration = todayRows.reduce((s, r) => s + r.total_duration_ms, 0)

  const last7 = db
    .prepare(
      `SELECT date,
              SUM(requests) as requests,
              SUM(errors) as errors,
              SUM(total_duration_ms) as total_duration_ms
       FROM llm_usage_daily
       WHERE date >= date('now', '-6 days')
       GROUP BY date
       ORDER BY date DESC`,
    )
    .all() as Array<{
    date: string
    requests: number
    errors: number
    total_duration_ms: number
  }>

  const recent = db
    .prepare(
      `SELECT chat_id, channel, duration_ms, status, created_at
       FROM chat_request_log
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .all() as Array<{
    chat_id: string | null
    channel: string
    duration_ms: number
    status: string
    created_at: string
  }>

  return {
    uptimeSeconds: getUptimeSeconds(),
    today: {
      date,
      requests: totalRequests,
      errors: totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      avgLatencyMs: totalRequests > 0 ? Math.round(totalDuration / totalRequests) : 0,
      byChannel: todayRows.map((r) => ({
        channel: r.channel,
        requests: r.requests,
        errors: r.errors,
      })),
    },
    last7Days: last7.map((r) => ({
      date: r.date,
      requests: r.requests,
      errors: r.errors,
      avgLatencyMs: r.requests > 0 ? Math.round(r.total_duration_ms / r.requests) : 0,
    })),
    recentRequests: recent,
  }
}