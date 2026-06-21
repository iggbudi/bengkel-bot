import { describe, expect, it } from 'vitest'
import { recordChatRequest, getChatMetrics } from './metrics.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

describe('chat metrics', () => {
  useIsolatedTestDb()

  it('records requests and aggregates daily stats', () => {
    recordChatRequest({
      chatId: 'web:test-12345678901',
      channel: 'web',
      durationMs: 1200,
      status: 'ok',
    })
    recordChatRequest({
      chatId: 'web:test-12345678902',
      channel: 'web',
      durationMs: 800,
      status: 'error',
      errorMessage: 'LLM fail',
    })

    const metrics = getChatMetrics()
    expect(metrics.today.requests).toBe(2)
    expect(metrics.today.errors).toBe(1)
    expect(metrics.today.avgLatencyMs).toBe(1000)
    expect(metrics.recentRequests.length).toBeGreaterThanOrEqual(2)
  })
})