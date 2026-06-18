/**
 * WhatsApp Channel — Baileys v6
 * ------------------------------
 * Handles:
 *  - QR code authentication on first run
 *  - Session persistence (auth state saved to ./auth/wa-state)
 *  - Incoming message → agent → reply
 *  - Outgoing message queue (booking confirmations, etc.)
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type proto,
  type WASocket,
} from 'baileys'
import { Boom } from '@hapi/boom'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = join(__dirname, '../../auth/wa-session')

// ── Types ───────────────────────────────────────────────────────────────────

export type IncomingMessage = {
  from: string       // JID format: 6281234567890@s.whatsapp.net
  pushName: string   // Display name
  body: string       // Text content
  id: string         // Message ID
  timestamp: number
  isGroup: boolean
}

export type OutgoingMessage = {
  to: string
  text: string
}

export type MessageHandler = (msg: IncomingMessage) => Promise<string | null>

// ── WhatsApp Socket ──────────────────────────────────────────────────────────

export class WhatsAppChannel {
  private sock: WASocket | null = null
  private handler: MessageHandler | null = null
  private ready = false

  async start(handler: MessageHandler): Promise<void> {
    this.handler = handler

    // Ensure auth dir exists
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,           // Shows QR in terminal for pairing
      mobile: false,                     // Use desktop/WhatsApp Web protocol
      browser: ['BengkelBot', 'Chrome', '1.0.0'],
      logger: {
        info: (...args: unknown[]) => console.log('[WA INFO]', ...args),
        error: (...args: unknown[]) => console.error('[WA ERROR]', ...args),
        warn: (...args: unknown[]) => console.warn('[WA WARN]', ...args),
        debug: (...args: unknown[]) => console.log('[WA DEBUG]', ...args),
        level: 'silent',
        child: () => ({} as any),
        trace: (..._a: unknown[]) => {},
      } as any,
    })

    // ── Event listeners ──────────────────────────────────────────────────

    this.sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        console.log('\n╔══════════════════════════════════════════╗')
        console.log('║       📱 SCAN QR UNTUK BENGKELBOT       ║')
        console.log('╚══════════════════════════════════════════╝')
        console.log('Scan QR di atas dengan WhatsApp > Linked Devices\n')
      }

      if (connection === 'open') {
        this.ready = true
        const sock = this.sock!
        const me = sock.user
        console.log(`✅ WhatsApp connected! Number: ${me?.id?.split('@')[0]}`)
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
        console.log(`⚠️ WhatsApp disconnected (reason: ${reason}). Reconnecting...`)
        this.ready = false
        if (reason !== DisconnectReason.loggedOut) {
          setTimeout(() => this.start(handler), 5_000)
        }
      }
    })

    this.sock.ev.on('creds.update', saveCreds)

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const messageInfo of messages) {
        await this.handleIncomingMessage(messageInfo)
      }
    })
  }

  private async handleIncomingMessage(messageInfo: proto.IWebMessageInfo): Promise<void> {
    if (!this.sock || !this.handler) return

    // Ignore status broadcasts, edited messages, and own messages
    if (
      messageInfo.key.remoteJid?.includes('status') ||
      (messageInfo.key as any).override ||
      messageInfo.key.fromMe
    ) return

    const msg = messageInfo.message
    if (!msg) return

    const isGroup = (messageInfo.key.remoteJid?.includes('@g.us') ?? false)
    const body =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      ''

    if (!body.trim()) return

    const incoming: IncomingMessage = {
      from: messageInfo.key.remoteJid!,
      pushName: messageInfo.pushName || 'Pelanggan',
      body: body.trim(),
      id: messageInfo.key.id!,
      timestamp: Number(messageInfo.messageTimestamp ?? Math.floor(Date.now() / 1000)),
      isGroup,
    }

    // Ignore group messages unless mentioned (future: mention detection)
    if (isGroup) return

    try {
      const reply = await this.handler(incoming)
      if (reply) {
        await this.sock.sendMessage(incoming.from, { text: reply }, {
        quoted: messageInfo,
      })
      }
    } catch (err) {
      console.error('[WA] Handler error:', err)
      await this.sock.sendMessage(incoming.from, {
        text: 'Maaf, ada gangguan teknis. Silakan coba beberapa saat lagi 🙏',
      })
    }
  }

  // ── Public send ───────────────────────────────────────────────────────

  async send(to: string, text: string): Promise<void> {
    if (!this.sock || !this.ready) {
      console.warn('[WA] Cannot send — socket not ready')
      return
    }
    // Normalize: strip spaces, add @s.whatsapp.net if bare number
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`
    await this.sock.sendMessage(jid, { text })
  }

  async sendImage(to: string, imagePath: string, caption?: string): Promise<void> {
    if (!this.sock || !this.ready) return
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`
    const { readFileSync } = await import('fs')
    await this.sock.sendMessage(jid, {
      image: readFileSync(imagePath),
      caption,
    })
  }

  get isReady(): boolean {
    return this.ready
  }

  async stop(): Promise<void> {
    await this.sock?.logout()
    this.sock = null
    this.ready = false
  }
}
