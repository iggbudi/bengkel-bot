/**
 * Health watchdog — alert webhook after consecutive failures.
 */

import { getExtendedHealth } from './health.js'

let consecutiveFailures = 0
let watchdogTimer: ReturnType<typeof setInterval> | null = null

async function postWebhook(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error(`[ALERT] Webhook failed: HTTP ${res.status}`)
  }
}

export async function runHealthCheckOnce(): Promise<boolean> {
  const health = getExtendedHealth()
  if (health.ok) {
    consecutiveFailures = 0
    return true
  }

  consecutiveFailures++
  console.warn(
    `[ALERT] Health check failed (${consecutiveFailures}/3):`,
    JSON.stringify({
      configError: health.configError,
      db: health.db,
      disk: health.disk,
    }),
  )

  const webhook = process.env.ALERT_WEBHOOK_URL?.trim()
  const threshold = Number(process.env.ALERT_FAILURE_THRESHOLD ?? 3)

  if (webhook && consecutiveFailures >= threshold) {
    await postWebhook(webhook, {
      event: 'health_degraded',
      service: 'cmaestro-bengkelbot',
      host: process.env.WORKSHOP_NAME ?? 'BengkelBot',
      failures: consecutiveFailures,
      health,
      ts: new Date().toISOString(),
    })
    consecutiveFailures = 0
  }

  return false
}

export function startHealthWatchdog(): void {
  const webhook = process.env.ALERT_WEBHOOK_URL?.trim()
  if (!webhook) return

  const intervalMs = Number(process.env.HEALTH_CHECK_INTERVAL_MS ?? 60_000)
  if (watchdogTimer) clearInterval(watchdogTimer)

  watchdogTimer = setInterval(() => {
    runHealthCheckOnce().catch((err) => {
      console.error('[ALERT] Watchdog error:', err instanceof Error ? err.message : err)
    })
  }, intervalMs)

  console.log(`[ALERT] Health watchdog aktif (interval ${intervalMs}ms)`)
}

export function stopHealthWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
}

/** Reset failure counter — for tests. */
export function resetAlertState(): void {
  consecutiveFailures = 0
}