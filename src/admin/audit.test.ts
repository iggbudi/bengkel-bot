import { describe, expect, it } from 'vitest'
import { logAdminAction, listRecentAuditLogs } from './audit.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('admin audit log', () => {
  useIsolatedTestDb()

  it('records and lists audit entries', () => {
    logAdminAction('admin', 'login')
    logAdminAction('admin', 'kb.update', 'faq')

    const logs = listRecentAuditLogs(10)
    expect(logs.length).toBeGreaterThanOrEqual(2)
    expect(logs.some((l) => l.action === 'login')).toBe(true)
    expect(logs.some((l) => l.action === 'kb.update' && l.detail === 'faq')).toBe(true)
  })
})