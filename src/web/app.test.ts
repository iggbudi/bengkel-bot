import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { BotConfig } from '../bot/agent.js'
import { createWebApp } from './app.js'
import { createChatToken } from './chat-auth.js'
import { resetRateLimits } from './rate-limit.js'
import { useIsolatedTestDb } from '../test/db-helper.js'

const mockConfig: BotConfig = {
  openaiApiKey: 'test',
  openaiBaseUrl: 'https://api.openai.com/v1',
  sumopodApiKey: 'test-key',
  sumopodBaseUrl: 'https://ai.sumopod.com/v1',
  llmProvider: 'sumopod',
  llmModel: 'deepseek-v4-pro',
  workshopName: 'Test Workshop',
  workshopAddress: 'Test',
  workshopPhone: '081',
  workshopHours: '08-17',
  workshopDays: 'Senin-Sabtu',
  workshopSpec: 'Mobil',
  botName: 'TestBot',
}

function createMockBot() {
  return {
    getLlmDescription: () => 'sumopod/test-model',
    processMessage: vi.fn().mockResolvedValue('Balasan bot'),
    processMessageStream: vi.fn().mockImplementation(
      async (
        _chatId: string,
        _name: string,
        _message: string,
        onChunk: (delta: string, accumulated: string) => void,
      ) => {
        onChunk('Bala', 'Bala')
        onChunk('san', 'Balasan')
        return 'Balasan'
      },
    ),
  }
}

async function listen(server: ReturnType<typeof createWebApp>): Promise<{ port: number; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    port: address.port,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}

describe('chat API integration', () => {
  useIsolatedTestDb()

  beforeEach(() => {
    process.env.LLM_PROVIDER = 'sumopod'
    process.env.SUMOPOD_API_KEY = 'test-key'
    process.env.CHAT_SECRET = 'integration-test-secret'
    resetRateLimits()
  })

  afterEach(() => {
    resetRateLimits()
  })

  it('GET /api/health returns ok', async () => {
    const server = createWebApp(mockConfig, createMockBot())
    const { port, close } = await listen(server)

    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.workshop).toBe('Test Workshop')
    expect(body.db?.ok).toBe(true)
    expect(body.uptime?.seconds).toBeGreaterThanOrEqual(0)
    expect(body.disk).toHaveProperty('freeMb')

    await close()
  })

  it('GET /api/chat/history requires valid token', async () => {
    const server = createWebApp(mockConfig, createMockBot())
    const { port, close } = await listen(server)
    const chatId = 'hist-test-12345678'

    const noToken = await fetch(
      `http://127.0.0.1:${port}/api/chat/history?chatId=${chatId}`,
    )
    expect(noToken.status).toBe(401)

    const token = createChatToken(chatId)
    const withToken = await fetch(
      `http://127.0.0.1:${port}/api/chat/history?chatId=${chatId}&chatToken=${token}`,
    )
    expect(withToken.status).toBe(200)

    await close()
  })

  it('GET /api/chat streams SSE with mock bot', async () => {
    const bot = createMockBot()
    const server = createWebApp(mockConfig, bot)
    const { port, close } = await listen(server)

    const chatId = 'sse-test-123456789'
    const token = createChatToken(chatId)
    const params = new URLSearchParams({
      chatId,
      chatToken: token,
      customerName: 'Tester',
      message: 'Halo',
    })

    const res = await fetch(`http://127.0.0.1:${port}/api/chat?${params}`)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('event: start')
    expect(body).toContain('event: done')
    expect(bot.processMessageStream).toHaveBeenCalledOnce()

    await close()
  })

  it('rate limits excessive chat token requests', async () => {
    process.env.RATE_LIMIT_TOKEN_PER_MIN = '2'
    resetRateLimits()

    const server = createWebApp(mockConfig, createMockBot())
    const { port, close } = await listen(server)
    const chatId = 'rate-test-123456789'

    const first = await fetch(`http://127.0.0.1:${port}/api/chat/token?chatId=${chatId}`)
    const second = await fetch(`http://127.0.0.1:${port}/api/chat/token?chatId=${chatId}`)
    const third = await fetch(`http://127.0.0.1:${port}/api/chat/token?chatId=${chatId}`)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(third.status).toBe(429)

    await close()
  })
})