/**
 * BengkelBot Web MVP
 * ------------------
 * Run with: npm run web
 * Opens a tiny browser chat UI backed by BengkelBot.processMessage().
 */

import { config as loadEnv } from 'dotenv'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  getAdminCredentials,
  createSession,
  getSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from '../admin/auth.js'
import { getKbNames, readKb, writeKb, KB_FILES } from '../admin/kb.js'
import { listBookings, updateBookingStatus } from '../admin/bookings.js'
import { readSettings, writeSettings } from '../admin/settings.js'
import { listConversations, getConversation, getSessionStats } from '../admin/conversations.js'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { ConversationRepo, getDb, type DbBooking } from '../db/schema.js'
import { BengkelBot, createBotConfigFromEnv } from '../bot/agent.js'

loadEnv({ override: true })

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '../..')
const PUBLIC_DIR = join(ROOT_DIR, 'public')
const PORT = Number(process.env.WEB_PORT ?? 3000)
const HOST = process.env.WEB_HOST ?? '127.0.0.1'

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

function validateLlmConfig(): string | null {
  const provider = process.env.LLM_PROVIDER ?? 'openai'

  if (provider === 'openai' && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your_'))) {
    return 'OPENAI_API_KEY belum diset di .env'
  }

  if (provider === 'sumopod' && (!process.env.SUMOPOD_API_KEY || process.env.SUMOPOD_API_KEY.includes('your_'))) {
    return 'SUMOPOD_API_KEY belum diset di .env'
  }

  return null
}

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

async function main(): Promise<void> {
  getDb()
  const config = createBotConfigFromEnv()
  const bot = new BengkelBot(config)

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, {
          ok: validateLlmConfig() === null,
          configError: validateLlmConfig(),
          bot: config.botName,
          workshop: config.workshopName,
          tagline: process.env.BOT_TAGLINE ?? 'Asisten pintar bengkel mobil Anda',
          workshopAddress: config.workshopAddress,
          workshopPhone: config.workshopPhone,
          workshopHours: config.workshopHours,
          workshopDays: config.workshopDays,
          workshopSpec: config.workshopSpec,
          llm: bot.getLlmDescription(),
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/chat') {
        const content = await readFile(join(PUBLIC_DIR, 'chat.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(content)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/chat/history') {
        const chatId = url.searchParams.get('chatId')?.trim()
        if (!chatId) {
          json(res, 400, { error: 'chatId wajib diisi' })
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
        const configError = validateLlmConfig()
        if (configError) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: configError }))
          return
        }

        const chatId = url.searchParams.get('chatId')?.trim() || 'web-local'
        const customerName = url.searchParams.get('customerName')?.trim() || 'Web Tester'
        const message = url.searchParams.get('message')?.trim()
        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'message wajib diisi' }))
          return
        }

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

        try {
          await Promise.race([
            bot.processMessageStream(`web:${chatId}`, customerName, message, (delta, accumulated) => {
              send('delta', { delta, text: accumulated })
            }).then((finalText) => {
              send('done', { text: finalText })
              res.end()
            }),
            reqAbort,
          ])
        } catch (err: any) {
          send('error', { error: err?.message || 'Maaf, ada gangguan teknis.' })
          res.end()
        }
        return
      }

      // JSON fallback for legacy/WhatsApp-style call
      if (req.method === 'POST' && url.pathname === '/api/chat') {
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
        }

        const message = body.message?.trim()
        if (!message) {
          json(res, 400, { error: 'Message wajib diisi' })
          return
        }

        const chatId = body.chatId?.trim() || 'web-local'
        const customerName = body.customerName?.trim() || 'Web Tester'
        const reply = await bot.processMessage(`web:${chatId}`, customerName, message)
        json(res, 200, { reply })
        return
      }

      // ── Admin API routes ─────────────────────────────────────────

      if (req.method === 'POST' && url.pathname === '/admin/api/login') {
        const raw = await readBody(req)
        const { username, password } = JSON.parse(raw || '{}') as { username?: string; password?: string }
        const creds = getAdminCredentials()

        if (username === creds.username && password === creds.password) {
          const session = createSession(username)
          setSessionCookie(res, session, req)
          json(res, 200, { ok: true })
        } else {
          json(res, 401, { error: 'Username atau password salah' })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/admin/api/logout') {
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
        if (!requireAuth(req, res)) return
        const name = url.pathname.split('/').pop()!
        const raw = await readBody(req)
        const { content } = JSON.parse(raw || '{}') as { content?: string }
        if (typeof content !== 'string') {
          json(res, 400, { error: 'content wajib diisi (string)' })
          return
        }
        const result = await writeKb(name, content)
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
        if (!requireAuth(req, res)) return
        const id = url.pathname.split('/').pop()!
        const raw = await readBody(req)
        const { status, notes } = JSON.parse(raw || '{}') as { status?: string; notes?: string }
        if (!status) {
          json(res, 400, { error: 'status wajib diisi' })
          return
        }
        const result = updateBookingStatus(id, status as any, notes)
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
        json(res, 200, { settings })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/admin/api/settings') {
        if (!requireAuth(req, res)) return
        const raw = await readBody(req)
        const updates = JSON.parse(raw || '{}') as Record<string, string>
        const result = await writeSettings(updates)
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
      console.error('[WEB] Error:', err)
      json(res, 500, { error: 'Maaf, ada gangguan teknis. Cek terminal server untuk detail.' })
    }
  })

  server.listen(PORT, HOST, () => {
    console.log('🔧 BengkelBot Web MVP')
    console.log(`URL: http://${HOST}:${PORT}`)
    console.log(`Workshop: ${config.workshopName}`)
    console.log(`LLM: ${bot.getLlmDescription()}`)
    const configError = validateLlmConfig()
    if (configError) console.warn(`⚠️  ${configError}`)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
