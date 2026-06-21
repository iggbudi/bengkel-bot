/**
 * Settings Admin API
 * ------------------
 * Read/write workshop config from .env file.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '../../.env')

const EDITABLE_KEYS = [
  'WORKSHOP_NAME',
  'WORKSHOP_ADDRESS',
  'WORKSHOP_PHONE',
  'WORKSHOP_HOURS',
  'WORKSHOP_DAYS',
  'WORKSHOP_SPECIALIZATION',
  'BOT_NAME',
  'BOT_TAGLINE',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LOG_LEVEL',
] as const

export type SettingsMap = Record<string, string>

const SECRET_KEYS = ['OPENAI_API_KEY', 'SUMOPOD_API_KEY', 'CHAT_SECRET'] as const

export function maskSecret(value: string | undefined): string {
  const v = value?.trim() ?? ''
  if (!v || v.includes('your_')) return '(belum diset)'
  if (v.length <= 8) return '***'
  return `${v.slice(0, 3)}***...***${v.slice(-4)}`
}

export function readMaskedSecrets(): Record<string, string> {
  const secrets: Record<string, string> = {}
  for (const key of SECRET_KEYS) {
    secrets[key] = maskSecret(process.env[key])
  }
  return secrets
}

export async function readSettings(): Promise<SettingsMap> {
  const env: SettingsMap = {}
  for (const key of EDITABLE_KEYS) {
    env[key] = process.env[key] ?? ''
  }
  return env
}

export async function writeSettings(updates: SettingsMap): Promise<{ ok: boolean; error?: string }> {
  if (!existsSync(ENV_PATH)) return { ok: false, error: '.env file tidak ditemukan' }

  const content = await readFile(ENV_PATH, 'utf-8')
  let updated = content

  for (const [key, value] of Object.entries(updates)) {
    if (!EDITABLE_KEYS.includes(key as (typeof EDITABLE_KEYS)[number])) continue

    const regex = new RegExp(`^${key}=.*$`, 'm')
    if (regex.test(updated)) {
      updated = updated.replace(regex, `${key}=${value}`)
    } else {
      updated = updated.trimEnd() + `\n${key}=${value}\n`
    }

    process.env[key] = value
  }

  await writeFile(ENV_PATH, updated, 'utf-8')
  return { ok: true }
}
