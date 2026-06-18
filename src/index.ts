/**
 * BengkelBot — Main Entry Point
 * -----------------------------
 * Starts:
 *  1. SQLite DB initialization
 *  2. WhatsApp Baileys channel
 *  3. pi SDK BengkelBot agent
 */

import { config as loadEnv } from 'dotenv'

loadEnv({ override: true })
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { BookingRepo, getDb, type DbBooking } from './db/schema.js'
import { WhatsAppChannel, type IncomingMessage } from './channels/whatsapp.js'
import { BengkelBot, createBotConfigFromEnv } from './bot/agent.js'
import { handleWorkshopTool } from './tools/workshop.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../data')

function validateLlmConfig(): void {
  const provider = process.env.LLM_PROVIDER ?? 'openai'

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('Missing required env var: OPENAI_API_KEY (LLM_PROVIDER=openai)')
  }

  if (provider === 'sumopod' && !process.env.SUMOPOD_API_KEY) {
    throw new Error('Missing required env var: SUMOPOD_API_KEY (LLM_PROVIDER=sumopod)')
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║      🔧 BENGKELBOT — LLM Chatbot         ║')
  console.log('║   for Car Workshops — Semarang Edition   ║')
  console.log('╚══════════════════════════════════════════╝\n')

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  validateLlmConfig()

  console.log('[DB] Initializing SQLite...')
  getDb()
  console.log('[DB] ✅ Done\n')

  const config = createBotConfigFromEnv()
  const bot = new BengkelBot(config)

  console.log(`[Config] Workshop: ${config.workshopName}`)
  console.log(`[Config] LLM: ${bot.getLlmDescription()}\n`)

  const wa = new WhatsAppChannel()

  const messageHandler = async (msg: IncomingMessage): Promise<string | null> => {
    const phone = msg.from.split('@')[0]
    console.log(`\n[WA IN] ${msg.pushName} (${phone}): ${msg.body}`)

    if (msg.body.startsWith('/')) {
      return handleMontirCommand(msg.body, wa, bot)
    }

    try {
      const reply = await bot.processMessage(msg.from, msg.pushName, msg.body)
      console.log(`[WA OUT]: ${reply.substring(0, 80)}...`)
      return reply
    } catch (err) {
      console.error('[Bot] Error:', err)
      return 'Maaf, ada gangguan teknis. Silakan coba lagi 🙏'
    }
  }

  console.log('[WA] Starting WhatsApp connection...')
  await wa.start(messageHandler)

  console.log('\n✅ BengkelBot is running!')
  console.log('   Scan the QR code above with WhatsApp to connect.')
  console.log('   Press Ctrl+C to stop.\n')

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...')
    await wa.stop()
    process.exit(0)
  })
}

async function handleMontirCommand(
  cmd: string,
  _wa: WhatsAppChannel,
  _bot: BengkelBot
): Promise<string> {
  const parts = cmd.trim().split(/\s+/)
  const action = parts[0]?.toLowerCase()

  switch (action) {
    case '/help':
      return `📋 Commands for Montir:
/status <plat> pending|approved|in_progress|done|cancelled [catatan] — Update booking status
/catalog — View service catalog
/stats — Today's summary (coming soon)
/takeover <plat> — Take over conversation`

    case '/status':
      return handleStatusCommand(parts)

    case '/catalog':
      return handleCatalogCommand()

    default:
      return `Command tidak dikenal: ${action}\nKetik /help untuk daftar commands.`
  }
}

async function handleCatalogCommand(): Promise<string> {
  const result = await handleWorkshopTool({ name: 'get_service_catalog', args: {} })
  const catalog = JSON.parse(result) as { services?: Array<{ name: string; description: string; estimate: string }> }

  if (!catalog.services?.length) {
    return 'Katalog layanan belum tersedia.'
  }

  return catalog.services
    .map((service, index) => `${index + 1}. ${service.name} — ${service.estimate}\n   ${service.description}`)
    .join('\n')
}

function handleStatusCommand(parts: string[]): string {
  const validStatuses: DbBooking['status'][] = ['pending', 'approved', 'in_progress', 'done', 'cancelled']
  const statusIndex = parts.findIndex((part, index) => index > 0 && validStatuses.includes(part.toLowerCase() as DbBooking['status']))

  if (statusIndex < 2) {
    return 'Format: /status <plat> <status> [catatan]\nContoh: /status B1234CD done sudah diambil pelanggan'
  }

  const plateNumber = parts.slice(1, statusIndex).join(' ').toUpperCase()
  const status = parts[statusIndex].toLowerCase() as DbBooking['status']
  const notes = parts.slice(statusIndex + 1).join(' ') || undefined
  const booking = BookingRepo.findByPlate(plateNumber)

  if (!booking) {
    return `Booking untuk plat ${plateNumber} tidak ditemukan.`
  }

  BookingRepo.updateStatus(booking.id, status, notes)

  return [
    `✅ Status ${plateNumber} diupdate: ${booking.status} → ${status}`,
    notes ? `Catatan: ${notes}` : undefined,
  ].filter(Boolean).join('\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})