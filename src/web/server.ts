/**
 * BengkelBot Web MVP
 * ------------------
 * Run with: npm run web
 * Opens a tiny browser chat UI backed by BengkelBot.processMessage().
 */

import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { getDb } from '../db/schema.js'
import { BengkelBot, createBotConfigFromEnv } from '../bot/agent.js'
import { createWebApp, validateLlmConfig } from './app.js'
import { initAdminAuth, warnIfInsecureAdminCredentials } from '../admin/auth.js'
import { warnIfInsecureChatSecret } from './chat-auth.js'
import { startHealthWatchdog } from '../observability/alert.js'

loadEnv({ override: true })

const PORT = Number(process.env.WEB_PORT ?? 3000)
const HOST = process.env.WEB_HOST ?? '127.0.0.1'

async function main(): Promise<void> {
  getDb()
  initAdminAuth()
  const config = createBotConfigFromEnv()
  const bot = new BengkelBot(config)
  const server = createWebApp(config, bot)

  warnIfInsecureAdminCredentials()
  warnIfInsecureChatSecret()
  startHealthWatchdog()

  server.listen(PORT, HOST, () => {
    console.log('🔧 BengkelBot Web MVP')
    console.log(`URL: http://${HOST}:${PORT}`)
    console.log(`Workshop: ${config.workshopName}`)
    console.log(`LLM: ${bot.getLlmDescription()}`)
    const configError = validateLlmConfig()
    if (configError) console.warn(`⚠️  ${configError}`)
  })
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}