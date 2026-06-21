/**
 * BengkelBot Web Application
 * HTTP request handler + server factory (testable).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  createSession,
  getSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAuthWithCsrf,
  verifyAdminLogin,
} from '../admin/auth.js'
import { logAdminAction } from '../admin/audit.js'
import { getKbNames, readKb, writeKb, KB_FILES } from '../admin/kb.js'
import { listBookings, updateBookingStatus } from '../admin/bookings.js'
import { readSettings, readMaskedSecrets, writeSettings } from '../admin/settings.js'
import { listConversations, getConversation, getSessionStats } from '../admin/conversations.js'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { ConversationRepo, getDb } from '../db/schema.js'
import type { BotConfig } from '../bot/agent.js'
import {
  createChatToken,
  verifyChatToken,
  warnIfInsecureChatSecret,
} from './chat-auth.js'
import { parseChatInput, validateChatId } from './chat-validation.js'
import { applyRateLimit, getChatRateLimit, getTokenRateLimit } from './rate-limit.js'
import { isLlmTimeoutError } from '../bot/llm-timeout.js'
import { validateLlmConfig } from '../config/validate-llm.js'
import { getExtendedHealth } from '../observability/health.js'
import { recordChatRequest, getChatMetrics } from '../observability/metrics.js'
import type { ChatRequestStatus } from '../observability/request-log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '../..')
const PUBLIC_DIR = join(ROOT_DIR, 'public')

export interface WebAppBot {
  getLlmDescription(): string
  processMessage(chatId: string, customerName: string, message: string, channel?: string): Promise<string>
  processMessageStream(
    chatId: string,
    customerName: string,
    message: string,
    onChunk: (delta: string, accumulated: string) => void,
  ): Promise<string>
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export { validateLlmConfig } from '../config/validate-llm.js'

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const decodedPath = decodeURIComponent(pathname)
  const fullPath = normalize(join(PUBLIC_DIR, decodedPath))

  if (!fullPath.startsWith(PUBLIC_DIR) || !existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const content = await readFile(fullPath)
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(fullPath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  res.end(content)
}

export function createWebApp(config: BotConfig, bot: WebAppBot): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      if (req.method === 'GET' && url.pathname === '/api/health') {
        const extended = getExtendedHealth()
        json(res, 200, {
          ok: extended.ok,
          configError: extended.configError,
          bot: config.botName,
          workshop: config.workshopName,
          tagline: process.env.BOT_TAGLINE ?? 'Asisten pintar bengkel mobil Anda',
          workshopAddress: config.workshopAddress,
          workshopPhone: config.workshopPhone,
          workshopHours: config.workshopHours,
          workshopDays: config.workshopDays,
          workshopSpec: config.workshopSpec,
          llm: bot.getLlmDescription(),
          db: extended.db,
          disk: extended.disk,
          uptime: extended.uptime,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/chat') {
        const content = await readFile(join(PUBLIC_DIR, 'chat', 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(content)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/chat/token') {
        if (!applyRateLimit(req, res, getTokenRateLimit())) return

        const chatId = validateChatId(url.searchParams.get('chatId'))
        if (!chatId) {
          json(res, 400, { error: 'chatId tidak valid' })
          return
        }

        json(res, 200, { chatId, chatToken: createChatToken(chatId) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/chat/history') {
        if (!applyRateLimit(req, res, getChatRateLimit())) return

        const chatId = validateChatId(url.searchParams.get('chatId'))
        const chatToken = url.searchParams.get('chatToken')?.trim()

        if (!chatId) {
          json(res, 400, { error: 'chatId tidak valid' })
          return
        }
        if (!verifyChatToken(chatId, chatToken)) {
          json(res, 401, { error: 'chatToken tidak valid' })
          return
        }

        const raw = ConversationRepo.getMessages(`web:${chatId}`, 'web') as Array<{
          role: string
          content: string
        }>
        json(res, 200, { chatId, messages: raw })
        return
      }

      // SSE streaming chat endpoint
      if (req.method === 'GET' && url.pathname === '/api/chat') {
        if (!applyRateLimit(req, res, getChatRateLimit())) return

        const configError = validateLlmConfig()
        if (configError) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: configError }))
          return
        }

        const chatToken = url.searchParams.get('chatToken')?.trim()
        const parsed = parseChatInput(
          url.searchParams.get('chatId'),
          url.searchParams.get('customerName'),
          url.searchParams.get('message'),
        )
        if (!parsed.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: parsed.error }))
          return
        }
        if (!verifyChatToken(parsed.data.chatId, chatToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'chatToken tidak valid' }))
          return
        }

        const { chatId, customerName, message } = parsed.data

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })

        const send = (event: string, data: unknown) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }

        const reqAbort = new Promise<void>((r) => req.on('close', r))

        send('start', { ok: true })

        const chatStarted = Date.now()
        const fullChatId = `web:${chatId}`
        let streamStatus: ChatRequestStatus = 'aborted'
        let streamError: string | undefined

        try {
          let completed = false
          await Promise.race([
            bot
              .processMessageStream(fullChatId, customerName, message, (delta, accumulated) => {
                send('delta', { delta, text: accumulated })
              })
              .then((finalText) => {
                completed = true
                streamStatus = 'ok'
                send('done', { text: finalText })
                res.end()
              }),
            reqAbort,
          ])
          if (!completed && !res.writableEnded) {
            streamStatus = 'aborted'
            res.end()
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Maaf, ada gangguan teknis.'
          streamStatus = isLlmTimeoutError(err) ? 'timeout' : 'error'
          streamError = errMsg
          send('error', {
            error: isLlmTimeoutError(err) ? errMsg : errMsg || 'Maaf, ada gangguan teknis.',
            timeout: isLlmTimeoutError(err),
          })
          res.end()
        } finally {
          recordChatRequest({
            chatId: fullChatId,
            channel: 'web',
            durationMs: Date.now() - chatStarted,
            status: streamStatus,
            errorMessage: streamError,
          })
        }
        return
      }

      // JSON fallback for legacy/WhatsApp-style call
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        if (!applyRateLimit(req, res, getChatRateLimit())) return

        const configError = validateLlmConfig()
        if (configError) {
          json(res, 400, { error: configError })
          return
        }

        const raw = await readBody(req)
        const body = JSON.parse(raw || '{}') as {
          message?: string
          chatId?: string
          customerName?: string
          chatToken?: string
        }

        const parsed = parseChatInput(body.chatId, body.customerName, body.message)
        if (!parsed.ok) {
          json(res, 400, { error: parsed.error })
          return
        }
        if (!verifyChatToken(parsed.data.chatId, body.chatToken?.trim())) {
          json(res, 401, { error: 'chatToken tidak valid' })
          return
        }

        const { chatId, customerName, message } = parsed.data
        const fullChatId = `web:${chatId}`
        const chatStarted = Date.now()
        try {
          const reply = await bot.processMessage(fullChatId, customerName, message)
          recordChatRequest({
            chatId: fullChatId,
            channel: 'web',
            durationMs: Date.now() - chatStarted,
            status: 'ok',
          })
          json(res, 200, { reply })
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Maaf, ada gangguan teknis.'
          const reqStatus: ChatRequestStatus = isLlmTimeoutError(err) ? 'timeout' : 'error'
          recordChatRequest({
            chatId: fullChatId,
            channel: 'web',
            durationMs: Date.now() - chatStarted,
            status: reqStatus,
            errorMessage: errorMsg,
          })
          const status = isLlmTimeoutError(err) ? 504 : 500
          json(res, status, { error: errorMsg, timeout: isLlmTimeoutError(err) })
        }
        return
      }

      // ── Admin API routes ─────────────────────────────────────────

      if (req.method === 'POST' && url.pathname === '/admin/api/login') {
        const raw = await readBody(req)
        const { username, password } = JSON.parse(raw || '{}') as { username?: string; password?: string }

        if (username && password && (await verifyAdminLogin(username, password))) {
          const session = createSession(username)
          setSessionCookie(res, session, req)
          logAdminAction(username, 'login')
          json(res, 200, { ok: true, csrfToken: session.csrfToken })
        } else {
          json(res, 401, { error: 'Username atau password salah' })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/metrics') {
        if (!requireAuth(req, res)) return
        json(res, 200, getChatMetrics())
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/session') {
        const session = requireAuth(req, res)
        if (!session) return
        json(res, 200, {
          ok: true,
          username: session.username,
          csrfToken: session.csrfToken,
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/logout') {
        const session = getSession(req)
        if (session) logAdminAction(session.username, 'logout')
        destroySession(req)
        clearSessionCookie(res, req)
        res.writeHead(302, { Location: '/admin/login' })
        res.end()
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/kb') {
        if (!requireAuth(req, res)) return
        const names = getKbNames()
        json(res, 200, {
          items: names.map((n) => ({ name: n, label: KB_FILES[n].label })),
        })
        return
      }

      if (req.method === 'GET' && url.pathname.startsWith('/admin/api/kb/')) {
        if (!requireAuth(req, res)) return
        const name = url.pathname.split('/').pop()!
        const result = await readKb(name)
        json(res, result.ok ? 200 : 404, result)
        return
      }

      if (req.method === 'PUT' && url.pathname.startsWith('/admin/api/kb/')) {
        const session = requireAuthWithCsrf(req, res)
        if (!session) return
        const name = url.pathname.split('/').pop()!
        const raw = await readBody(req)
        const { content } = JSON.parse(raw || '{}') as { content?: string }
        if (typeof content !== 'string') {
          json(res, 400, { error: 'content wajib diisi (string)' })
          return
        }
        const result = await writeKb(name, content)
        if (result.ok) logAdminAction(session.username, 'kb.update', name)
        json(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/bookings') {
        if (!requireAuth(req, res)) return
        const status = url.searchParams.get('status') || undefined
        json(res, 200, { bookings: listBookings(status) })
        return
      }

      if (req.method === 'PUT' && url.pathname.match(/^\/admin\/api\/bookings\/[a-f0-9-]+$/)) {
        const session = requireAuthWithCsrf(req, res)
        if (!session) return
        const id = url.pathname.split('/').pop()!
        const raw = await readBody(req)
        const { status, notes } = JSON.parse(raw || '{}') as { status?: string; notes?: string }
        if (!status) {
          json(res, 400, { error: 'status wajib diisi' })
          return
        }
        const result = updateBookingStatus(id, status as any, notes)
        if (result.ok) logAdminAction(session.username, 'booking.update', `${id} → ${status}`)
        json(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/conversations') {
        if (!requireAuth(req, res)) return
        const channel = url.searchParams.get('channel') || undefined
        const limit = Number(url.searchParams.get('limit') ?? 50)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        json(res, 200, listConversations({ channel, limit, offset }))
        return
      }

      if (req.method === 'GET' && url.pathname.match(/^\/admin\/api\/conversations\/[a-f0-9-]+$/)) {
        if (!requireAuth(req, res)) return
        const id = url.pathname.split('/').pop()!
        const conv = getConversation(id)
        if (!conv) {
          json(res, 404, { error: 'Conversation tidak ditemukan' })
          return
        }
        json(res, 200, { conversation: conv })
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/conversations/stats') {
        if (!requireAuth(req, res)) return
        json(res, 200, getSessionStats())
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/settings') {
        if (!requireAuth(req, res)) return
        const settings = await readSettings()
        const secrets = readMaskedSecrets()
        json(res, 200, { settings, secrets })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/admin/api/settings') {
        const session = requireAuthWithCsrf(req, res)
        if (!session) return
        const raw = await readBody(req)
        const updates = JSON.parse(raw || '{}') as Record<string, string>
        const result = await writeSettings(updates)
        if (result.ok) logAdminAction(session.username, 'settings.update')
        json(res, result.ok ? 200 : 400, result)
        return
      }

      // ── Admin HTML routes ─────────────────────────────────────────

      if (req.method === 'GET' && url.pathname === '/admin/login') {
        if (getSession(req)) {
          res.writeHead(302, { Location: '/admin' })
          res.end()
          return
        }
        const content = await readFile(join(PUBLIC_DIR, 'admin/login.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(content)
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/logout') {
        destroySession(req)
        clearSessionCookie(res, req)
        res.writeHead(302, { Location: '/admin/login' })
        res.end()
        return
      }

      if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
        if (!requireAuth(req, res)) return
        const content = await readFile(join(PUBLIC_DIR, 'admin/dashboard.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(content)
        return
      }

      if (req.method === 'GET' && url.pathname.startsWith('/admin/') && !url.pathname.startsWith('/admin/api/')) {
        const adminFile = url.pathname.replace(/^\/admin\//, '')
        const fullPath = normalize(join(PUBLIC_DIR, 'admin', adminFile))
        if (fullPath.startsWith(join(PUBLIC_DIR, 'admin')) && existsSync(fullPath)) {
          const content = await readFile(fullPath)
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[extname(fullPath)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
          })
          res.end(content)
          return
        }
      }

      // ── Public static ────────────────────────────────────────────

      if (req.method === 'GET') {
        await serveStatic(req, res)
        return
      }

      json(res, 405, { error: 'Method not allowed' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[WEB] Error:', msg)
      json(res, 500, { error: 'Maaf, ada gangguan teknis. Cek terminal server untuk detail.' })
    }
  })
}
