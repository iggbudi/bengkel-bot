import { describe, expect, it } from 'vitest'
import { checkDbHealth, getExtendedHealth } from './health.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('extended health', () => {
  useIsolatedTestDb()

  it('reports db ok', () => {
    expect(checkDbHealth().ok).toBe(true)
  })

  it('includes uptime and disk in extended health', () => {
    process.env.SUMOPOD_API_KEY = 'test-key'
    process.env.LLM_PROVIDER = 'sumopod'

    const health = getExtendedHealth()
    expect(health.uptime.seconds).toBeGreaterThanOrEqual(0)
    expect(health.db.ok).toBe(true)
    expect(health.disk).toHaveProperty('freeMb')
    expect(health.disk).toHaveProperty('totalMb')
  })
})