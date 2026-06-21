import { describe, expect, it } from 'vitest'
import {
  createSession,
  deleteSession,
  getSessionById,
  verifyCsrfToken,
} from './sessions.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('admin sessions', () => {
  useIsolatedTestDb()

  it('creates and retrieves persisted session', () => {
    const session = createSession('admin')
    const loaded = getSessionById(session.id)

    expect(loaded?.username).toBe('admin')
    expect(loaded?.csrfToken).toBe(session.csrfToken)
  })

  it('deletes session', () => {
    const session = createSession('admin')
    deleteSession(session.id)
    expect(getSessionById(session.id)).toBeNull()
  })

  it('validates CSRF token', () => {
    const session = createSession('admin')
    expect(verifyCsrfToken(session, session.csrfToken)).toBe(true)
    expect(verifyCsrfToken(session, 'invalid')).toBe(false)
  })
})