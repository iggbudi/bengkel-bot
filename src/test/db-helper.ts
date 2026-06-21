import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'vitest'
import { configureDbPath, resetDb, getDb } from '../db/schema.js'
import { seedWorkshop } from '../db/seed.js'

export function useIsolatedTestDb(): void {
  let tempDir = ''

  beforeEach(() => {
    resetDb()
    tempDir = mkdtempSync(join(tmpdir(), 'bengkelbot-test-'))
    configureDbPath(join(tempDir, 'test.db'))
    getDb()
    seedWorkshop(getDb(), {
      id: 'default',
      name: 'Test Workshop',
      address: 'Test Address',
      phone: '08111111111',
      hours: '08.00-17.00',
      days: 'Senin-Sabtu',
      specialization: 'Mobil umum',
    })
  })

  afterEach(() => {
    resetDb()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })
}