import { describe, expect, it } from 'vitest'
import { getDb } from './schema.js'
import { seedWorkshop, workshopSeedFromEnv } from './seed.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('workshop seed', () => {
  useIsolatedTestDb()

  it('workshopSeedFromEnv reads environment variables', () => {
    process.env.WORKSHOP_NAME = 'CMaestro'
    process.env.WORKSHOP_ADDRESS = 'Jl. Test 99'
    const seed = workshopSeedFromEnv()
    expect(seed.name).toBe('CMaestro')
    expect(seed.address).toBe('Jl. Test 99')
  })

  it('seedWorkshop upserts workshop row from env', () => {
    seedWorkshop(getDb(), {
      id: 'default',
      name: 'CMaestro',
      address: 'Jl. Woltermonginsidi',
      phone: '082138688986',
      hours: '08.30-16.30',
      days: 'Senin-Sabtu',
      specialization: 'Mobil umum',
    })

    seedWorkshop(getDb(), {
      id: 'default',
      name: 'CMaestro Updated',
      address: 'Jl. Baru',
      phone: '082100000000',
      hours: '09.00-17.00',
      days: 'Senin-Jumat',
      specialization: 'Mobil listrik',
    })

    const row = getDb()
      .prepare('SELECT name, address, phone FROM workshops WHERE id = ?')
      .get('default') as { name: string; address: string; phone: string }

    expect(row.name).toBe('CMaestro Updated')
    expect(row.address).toBe('Jl. Baru')
    expect(row.phone).toBe('082100000000')
  })
})