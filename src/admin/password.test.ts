import { describe, expect, it } from 'vitest'
import { hashAdminPassword, verifyAdminPassword } from './password.js'

describe('admin password', () => {
  it('hashes and verifies password with bcrypt', async () => {
    const plain = 'TestPassword123!'
    const hash = await hashAdminPassword(plain)
    process.env.ADMIN_PASSWORD_HASH = hash
    delete process.env.ADMIN_PASSWORD

    expect(await verifyAdminPassword(plain)).toBe(true)
    expect(await verifyAdminPassword('wrong')).toBe(false)
  })

  it('falls back to plain ADMIN_PASSWORD when hash not set', async () => {
    delete process.env.ADMIN_PASSWORD_HASH
    process.env.ADMIN_PASSWORD = 'plain-secret'

    expect(await verifyAdminPassword('plain-secret')).toBe(true)
    expect(await verifyAdminPassword('other')).toBe(false)
  })
})