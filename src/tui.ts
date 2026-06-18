/**
 * BengkelBot TUI / terminal chat mode
 * -----------------------------------
 * Run with: npm run tui
 * Useful for local testing without WhatsApp/Telegram.
 */

import { config as loadEnv } from 'dotenv'

loadEnv({ override: true })
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { getDb } from './db/schema.js'
import { BengkelBot, createBotConfigFromEnv } from './bot/agent.js'

function validateLlmConfig(): void {
  const provider = process.env.LLM_PROVIDER ?? 'openai'

  if (provider === 'openai' && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your_'))) {
    throw new Error('Set OPENAI_API_KEY di .env dulu, atau ganti LLM_PROVIDER=sumopod + SUMOPOD_API_KEY')
  }

  if (provider === 'sumopod' && (!process.env.SUMOPOD_API_KEY || process.env.SUMOPOD_API_KEY.includes('your_'))) {
    throw new Error('Set SUMOPOD_API_KEY di .env dulu, atau ganti LLM_PROVIDER=openai + OPENAI_API_KEY')
  }
}

async function main() {
  console.log('🔧 BengkelBot TUI')
  console.log('Ketik pesan pelanggan untuk test chatbot.')
  console.log('Commands: /help, /exit\n')

  validateLlmConfig()
  getDb()

  const bot = new BengkelBot(createBotConfigFromEnv())
  const rl = createInterface({ input, output })
  const chatId = `tui:${process.env.USERNAME ?? process.env.USER ?? 'local'}`
  const customerName = process.env.TUI_CUSTOMER_NAME ?? 'Tester TUI'

  try {
    while (true) {
      const message = (await rl.question('Anda > ')).trim()
      if (!message) continue

      if (message === '/exit' || message === '/quit') {
        console.log('Sampai jumpa 👋')
        break
      }

      if (message === '/help') {
        console.log('Bot  > Ketik pertanyaan pelanggan, contoh: "service completo berapa?", "cek status B1234CD", atau "mau booking besok jam 9". Keluar: /exit\n')
        continue
      }

      try {
        const reply = await bot.processMessage(chatId, customerName, message)
        console.log(`Bot  > ${reply}\n`)
      } catch (err) {
        console.error('Bot error:', err)
        console.log('Bot  > Maaf, ada gangguan teknis. Cek konfigurasi LLM/API key ya.\n')
      }
    }
  } finally {
    rl.close()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
