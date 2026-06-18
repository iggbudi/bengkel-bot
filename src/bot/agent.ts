/**
 * BengkelBot Agent
 * Wraps the pi SDK AgentSession with workshop-specific tools and LLM providers.
 */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent'
import { v4 as uuidv4 } from 'uuid'
import { handleWorkshopTool } from '../tools/workshop.js'
import { createWorkshopPiTools } from '../tools/workshop-pi.js'
import { buildSystemPrompt } from './system-prompt.js'
import { ConversationRepo } from '../db/schema.js'
import {
  describeLlm,
  resolveLlmEnv,
  resolveModel,
  toLlmConfig,
  type LlmConfig,
} from '../config/llm.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../../data')
const AUTH_PATH = join(DATA_DIR, 'auth.json')
const MODELS_PATH = join(DATA_DIR, 'models.json')

export interface BotConfig {
  openaiApiKey?: string
  openaiBaseUrl: string
  sumopodApiKey?: string
  sumopodBaseUrl: string
  llmProvider: LlmConfig['provider']
  llmModel: string
  workshopName: string
  workshopAddress: string
  workshopPhone: string
  workshopHours: string
  workshopDays: string
  workshopSpec: string
  botName: string
}

export function createBotConfigFromEnv(): BotConfig {
  const env = resolveLlmEnv()
  return {
    openaiApiKey: env.openaiApiKey,
    openaiBaseUrl: env.openaiBaseUrl,
    sumopodApiKey: env.sumopodApiKey,
    sumopodBaseUrl: env.sumopodBaseUrl,
    llmProvider: env.llmProvider,
    llmModel: env.llmModel,
    workshopName: process.env.WORKSHOP_NAME ?? 'Bengkel Demo Semarang',
    workshopAddress: process.env.WORKSHOP_ADDRESS ?? 'Semarang, Jawa Tengah',
    workshopPhone: process.env.WORKSHOP_PHONE ?? '-',
    workshopHours: process.env.WORKSHOP_HOURS ?? '08.00-17.00',
    workshopDays: process.env.WORKSHOP_DAYS ?? 'Senin-Sabtu',
    workshopSpec: process.env.WORKSHOP_SPECIALIZATION ?? 'Mobil umum',
    botName: process.env.BOT_NAME ?? 'BengkelBot',
  }
}

export class BengkelBot {
  private config: BotConfig
  private authStorage: AuthStorage
  private modelRegistry: ModelRegistry
  private llmConfig: LlmConfig

  constructor(config: BotConfig) {
    this.config = config
    this.llmConfig = toLlmConfig({
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      openaiApiKey: config.openaiApiKey,
      openaiBaseUrl: config.openaiBaseUrl,
      sumopodApiKey: config.sumopodApiKey,
      sumopodBaseUrl: config.sumopodBaseUrl,
    })
    this.authStorage = AuthStorage.create(AUTH_PATH)
    this.modelRegistry = ModelRegistry.create(this.authStorage, MODELS_PATH)
    this.registerApiKeys()
  }

  getLlmDescription(): string {
    return describeLlm(this.llmConfig)
  }

  private registerApiKeys(): void {
    if (this.config.openaiApiKey) {
      this.authStorage.setRuntimeApiKey('openai', this.config.openaiApiKey)
    }
    if (this.config.sumopodApiKey) {
      this.authStorage.setRuntimeApiKey('sumopod', this.config.sumopodApiKey)
    }
  }

  /**
   * Process an incoming message and return the bot's response.
   * chatId: unique per-customer identifier (phone number JID)
   */
  private detectChannel(chatId: string): 'whatsapp' | 'telegram' | 'web' {
    if (chatId.startsWith('web:')) return 'web'
    if (chatId.startsWith('telegram:')) return 'telegram'
    return 'whatsapp'
  }

  async processMessage(chatId: string, customerName: string, message: string, channel?: string): Promise<string> {
    const model = resolveModel(
      this.modelRegistry,
      this.llmConfig,
      this.config.openaiBaseUrl,
      this.config.sumopodBaseUrl
    )
    if (!model) {
      throw new Error(`Model tidak ditemukan: ${describeLlm(this.llmConfig)}`)
    }

    const auth = await this.modelRegistry.getApiKeyAndHeaders(model)
    const apiKey = auth.ok ? auth.apiKey : undefined
    if (!apiKey) {
      throw new Error(
        `API key tidak ditemukan untuk provider "${this.llmConfig.provider}". ` +
          `Set OPENAI_API_KEY atau SUMOPOD_API_KEY di .env`
      )
    }

    const systemPrompt = buildSystemPrompt({
      workshopName: this.config.workshopName,
      workshopAddress: this.config.workshopAddress,
      workshopPhone: this.config.workshopPhone,
      workshopHours: this.config.workshopHours,
      workshopDays: this.config.workshopDays,
      workshopSpec: this.config.workshopSpec,
      botName: this.config.botName,
    })

    const resolvedChannel = (channel as 'whatsapp' | 'telegram' | 'web') ?? this.detectChannel(chatId)
    const history = ConversationRepo.getMessages(chatId, resolvedChannel)
    const historyMessages = (history as Array<{ role: string; content: string }>).slice(-10)
    const historyBlock =
      historyMessages.length > 0
        ? `[Riwayat percakapan]\n${historyMessages
            .map((m) => `${m.role === 'user' ? 'Pelanggan' : 'Bot'}: ${m.content}`)
            .join('\n')}\n\n`
        : ''

    const promptText = `${historyBlock}[Pelanggan "${customerName}"]: ${message}`

    const loader = new DefaultResourceLoader({
      cwd: join(__dirname, '../..'),
      agentDir: join(__dirname, '../..'),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
      appendSystemPromptOverride: () => [],
    })
    await loader.reload()

    const { session } = await createAgentSession({
      cwd: join(__dirname, '../..'),
      agentDir: join(__dirname, '../..'),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model,
      thinkingLevel: model.reasoning ? 'low' : 'off',
      noTools: 'all',
      customTools: createWorkshopPiTools(),
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
    })

    try {
      const reply = await new Promise<string>((resolve, reject) => {
        const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
          if (event.type === 'agent_end') {
            unsubscribe()
            const text = session.getLastAssistantText()?.trim()
            if (text) {
              resolve(text)
              return
            }
            resolve('Hmm, saya lagi bingung nih. Biar montir yang bantu ya — akan dihubungi sebentar lagi 🙏')
          }

          if (event.type === 'message_end' && event.message.role === 'assistant') {
            const msg = event.message
            if ('errorMessage' in msg && msg.errorMessage) {
              unsubscribe()
              reject(new Error(msg.errorMessage))
            }
          }
        })

        session.prompt(promptText).catch((err) => {
          unsubscribe()
          reject(err)
        })
      })

      let finalText = reply
      if (!finalText.trim()) {
        finalText = 'Hmm, saya lagi bingung nih. Biar montir yang bantu ya — akan dihubungi sebentar lagi 🙏'
        await this.escalate(chatId, customerName, message, 'whatsapp')
      }

      const updatedHistory = [
        ...(history as Array<{ role: string; content: string }>),
        { role: 'user', content: message },
        { role: 'assistant', content: finalText },
      ]
      ConversationRepo.upsert({
        id: uuidv4(),
        workshop_id: 'default',
        chat_id: chatId,
        channel: (channel as 'whatsapp' | 'telegram' | 'web') ?? this.detectChannel(chatId),
        customer_id: null,
        last_message_at: null,
        messages: updatedHistory,
        escalated: false,
      })

      return finalText
    } finally {
      session.dispose()
    }
  }

  /**
   * Process an incoming message with streaming callback.
   * onChunk is called with each text delta as it arrives.
   * Returns the final full text.
   */
  async processMessageStream(
    chatId: string,
    customerName: string,
    message: string,
    onChunk: (delta: string, accumulated: string) => void,
  ): Promise<string> {
    const model = resolveModel(
      this.modelRegistry,
      this.llmConfig,
      this.config.openaiBaseUrl,
      this.config.sumopodBaseUrl
    )
    if (!model) throw new Error(`Model tidak ditemukan: ${describeLlm(this.llmConfig)}`)

    const auth = await this.modelRegistry.getApiKeyAndHeaders(model)
    const apiKey = auth.ok ? auth.apiKey : undefined
    if (!apiKey) {
      throw new Error(
        `API key tidak ditemukan untuk provider "${this.llmConfig.provider}". ` +
          `Set OPENAI_API_KEY atau SUMOPOD_API_KEY di .env`
      )
    }

    const systemPrompt = buildSystemPrompt({
      workshopName: this.config.workshopName,
      workshopAddress: this.config.workshopAddress,
      workshopPhone: this.config.workshopPhone,
      workshopHours: this.config.workshopHours,
      workshopDays: this.config.workshopDays,
      workshopSpec: this.config.workshopSpec,
      botName: this.config.botName,
    })

    const history = ConversationRepo.getMessages(chatId, this.detectChannel(chatId))
    const historyMessages = (history as Array<{ role: string; content: string }>).slice(-10)
    const historyBlock =
      historyMessages.length > 0
        ? `[Riwayat percakapan]\n${historyMessages
            .map((m) => `${m.role === 'user' ? 'Pelanggan' : 'Bot'}: ${m.content}`)
            .join('\n')}\n\n`
        : ''

    const promptText = `${historyBlock}[Pelanggan "${customerName}"]: ${message}`

    const loader = new DefaultResourceLoader({
      cwd: join(__dirname, '../..'),
      agentDir: join(__dirname, '../..'),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
      appendSystemPromptOverride: () => [],
    })
    await loader.reload()

    const { session } = await createAgentSession({
      cwd: join(__dirname, '../..'),
      agentDir: join(__dirname, '../..'),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model,
      thinkingLevel: model.reasoning ? 'low' : 'off',
      noTools: 'all',
      customTools: createWorkshopPiTools(),
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
    })

    let lastEmitted = ''

    const emitDelta = (fullText: string) => {
      if (fullText.length > lastEmitted.length) {
        const delta = fullText.slice(lastEmitted.length)
        lastEmitted = fullText
        onChunk(delta, fullText)
      }
    }

    try {
      const reply = await new Promise<string>((resolve, reject) => {
        const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
          if (event.type === 'message_update') {
            const msg = event.message as any
            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
              const text = msg.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text ?? '')
                .join('')
                .trim()
              if (text) emitDelta(text)
            }
          }

          if (event.type === 'agent_end') {
            unsubscribe()
            const text = session.getLastAssistantText()?.trim()
            if (text) {
              emitDelta(text)
              resolve(text)
              return
            }
            resolve(
              'Hmm, saya lagi bingung nih. Biar montir yang bantu ya — akan dihubungi sebentar lagi 🙏'
            )
          }

          if (event.type === 'message_end' && event.message.role === 'assistant') {
            const msg = event.message
            if ('errorMessage' in msg && msg.errorMessage) {
              unsubscribe()
              reject(new Error(msg.errorMessage))
            }
          }
        })

        session.prompt(promptText).catch((err) => {
          unsubscribe()
          reject(err)
        })
      })

      let finalText = reply
      if (!finalText.trim()) {
        finalText =
          'Hmm, saya lagi bingung nih. Biar montir yang bantu ya — akan dihubungi sebentar lagi 🙏'
        await this.escalate(chatId, customerName, message, 'whatsapp')
      }

      const updatedHistory = [
        ...(history as Array<{ role: string; content: string }>),
        { role: 'user', content: message },
        { role: 'assistant', content: finalText },
      ]
      ConversationRepo.upsert({
        id: uuidv4(),
        workshop_id: 'default',
        chat_id: chatId,
        channel: this.detectChannel(chatId),
        customer_id: null,
        last_message_at: null,
        messages: updatedHistory,
        escalated: false,
      })

      return finalText
    } finally {
      session.dispose()
    }
  }

  private async escalate(
    chatId: string,
    customerName: string,
    message: string,
    channel: string
  ): Promise<void> {
    await handleWorkshopTool({
      name: 'escalate_to_montir',
      args: { customer_name: customerName, summary: message, channel },
    })
  }
}