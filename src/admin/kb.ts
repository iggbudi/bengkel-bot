/**
 * Knowledge Base API
 * ------------------
 * Read/write markdown files in src/kb/.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// dist/admin/*.js → ../../src/kb ; src/admin/*.ts (tsx) → ../kb
const KB_DIR = existsSync(join(__dirname, '../kb'))
  ? join(__dirname, '../kb')
  : join(__dirname, '../../src/kb')

export const KB_FILES: Record<string, { label: string; file: string }> = {
  faq: { label: 'FAQ', file: 'faq.md' },
  services: { label: 'Layanan & Harga', file: 'services.md' },
  slang: { label: 'Slang Jawa', file: 'slang.md' },
  diagnostics: { label: 'Panduan Diagnosa', file: 'diagnostics.md' },
}

export function getKbNames(): string[] {
  return Object.keys(KB_FILES)
}

export async function readKb(name: string): Promise<{ ok: boolean; content?: string; error?: string }> {
  const entry = KB_FILES[name]
  if (!entry) return { ok: false, error: `KB "${name}" tidak ditemukan` }

  const path = join(KB_DIR, entry.file)
  if (!existsSync(path)) return { ok: true, content: '' }

  const content = await readFile(path, 'utf-8')
  return { ok: true, content }
}

export async function writeKb(name: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const entry = KB_FILES[name]
  if (!entry) return { ok: false, error: `KB "${name}" tidak ditemukan` }

  const path = join(KB_DIR, entry.file)
  await writeFile(path, content, 'utf-8')
  return { ok: true }
}
