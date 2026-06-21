/**
 * Extended health checks — DB, disk, uptime.
 */

import { statfsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from '../db/schema.js'
import { getStartedAtIso, getUptimeSeconds } from './uptime.js'
import { validateLlmConfig } from '../config/validate-llm.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../../data')

const MIN_DISK_FREE_BYTES = Number(process.env.MIN_DISK_FREE_MB ?? 100) * 1024 * 1024

export interface ExtendedHealth {
  ok: boolean
  configError: string | null
  db: { ok: boolean; error?: string }
  disk: {
    ok: boolean
    freeMb: number
    totalMb: number
    path: string
  }
  uptime: {
    seconds: number
    startedAt: string
  }
}

export function checkDbHealth(): { ok: boolean; error?: string } {
  try {
    getDb().prepare('SELECT 1').get()
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DB error'
    return { ok: false, error: message }
  }
}

export function checkDiskHealth(): ExtendedHealth['disk'] {
  try {
    const stats = statfsSync(DATA_DIR)
    const freeBytes = Number(stats.bfree) * Number(stats.bsize)
    const totalBytes = Number(stats.blocks) * Number(stats.bsize)
    return {
      ok: freeBytes >= MIN_DISK_FREE_BYTES,
      freeMb: Math.round(freeBytes / 1024 / 1024),
      totalMb: Math.round(totalBytes / 1024 / 1024),
      path: DATA_DIR,
    }
  } catch {
    return { ok: false, freeMb: 0, totalMb: 0, path: DATA_DIR }
  }
}

export function getExtendedHealth(): ExtendedHealth {
  const configError = validateLlmConfig()
  const db = checkDbHealth()
  const disk = checkDiskHealth()
  const ok = configError === null && db.ok && disk.ok

  return {
    ok,
    configError,
    db,
    disk,
    uptime: {
      seconds: getUptimeSeconds(),
      startedAt: getStartedAtIso(),
    },
  }
}