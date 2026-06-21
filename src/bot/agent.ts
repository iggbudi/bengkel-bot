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
import {
  handleWorkshopTool,
  setWorkshopToolContext,
  clearWorkshopToolContext,
} from '../tools/workshop.js'
import { createWorkshopPiTools } from '../tools/workshop-pi.js'
import { buildSystemPrompt } from './system-prompt.js'
import { getLlmTimeoutMs, withTimeout } from './llm-timeout.js'
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
const PROJECT_ROOT = join(__dirname, '../..')

const FALLBACK_REPLY =
  'Hmm, saya lagi bingung nih. Biar montir yang bantu ya — akan dihubungi sebentar lagi 🙏'

type Channel = 'whatsapp' | 'telegram' | 'web'

interface ProcessOptions {
  channel?: Channel
  onChunk?: (delta: string, accumulated: string) => void
}

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

  private detectChannel(chatId: string): Channel {
    if (chatId.startsWith('web:')) return 'web'
    if (chatId.startsWith('telegram:')) return 'telegram'
    return 'whatsapp'
  }

  private resolveChannel(chatId: string, channel?: string): Channel {
    if (channel === 'whatsapp' || channel === 'telegram' || channel === 'web') {
      return channel
    }
    return this.detectChannel(chatId)
  }

  private buildPromptText(
    history: Array<{ role: string; content: string }>,
    customerName: string,
    message: string,
  ): string {
    const historyMessages = history.slice(-10)
    const historyBlock =
      historyMessages.length > 0
        ? `[Riwayat percakapan]\n${historyMessages
            .map((m) => `${m.role === 'user' ? 'Pelanggan' : 'Bot'}: ${m.content}`)
            .join('\n')}\n\n`
        : ''
    return `${historyBlock}[Pelanggan "${customerName}"]: ${message}`
  }

  private async createSession(systemPrompt: string, model: NonNullable<ReturnType<typeof resolveModel>>) {
    const loader = new DefaultResourceLoader({
      cwd: PROJECT_ROOT,
      agentDir: PROJECT_ROOT,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
      appendSystemPromptOverride: () => [],
    })
    await loader.reload()

    return createAgentSession({
      cwd: PROJECT_ROOT,
      agentDir: PROJECT_ROOT,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      model,
      thinkingLevel: model.reasoning ? 'low' : 'off',
      noTools: 'all',
      customTools: createWorkshopPiTools(),
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
    })
  }

  private async executeAgentSession(
    session: Awaited<ReturnType<typeof createAgentSession>>['session'],
    promptText: string,
    onChunk?: (delta: string, accumulated: string) => void,
  ): Promise<string> {
    let lastEmitted = ''

    const emitDelta = (fullText: string) => {
      if (!onChunk || fullText.length <= lastEmitted.length) return
      const delta = fullText.slice(lastEmitted.length)
      lastEmitted = fullText
      onChunk(delta, fullText)
    }

    const promptPromise = new Promise<string>((resolve, reject) => {
      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === 'message_update' && onChunk) {
          const msg = event.message as {
            role?: string
            content?: Array<{ type: string; text?: string }>
          }
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            const text = msg.content
              .filter((b) => b.type === 'text')
              .map((b) => b.text ?? '')
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
          resolve(FALLBACK_REPLY)
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

    return withTimeout(promptPromise, getLlmTimeoutMs())
  }

  private saveConversation(
    chatId: string,
    channel: Channel,
    history: Array<{ role: string; content: string }>,
    message: string,
    finalText: string,
  ): void {
    const now = Date.now()
    const updatedHistory = [
      ...history,
      { role: 'user', content: message, at: now },
      { role: 'assistant', content: finalText, at: now },
    ]
    const customerId = ConversationRepo.getCustomerId(chatId, channel)
    ConversationRepo.upsert({
      id: uuidv4(),
      workshop_id: 'default',
      chat_id: chatId,
      channel,
      customer_id: customerId,
      last_message_at: null,
      messages: updatedHistory,
      escalated: false,
    })
  }

  private async processMessageCore(
    chatId: string,
    customerName: string,
    message: string,
    options: ProcessOptions = {},
  ): Promise<string> {
    const resolvedChannel = this.resolveChannel(chatId, options.channel)

    const model = resolveModel(
      this.modelRegistry,
      this.llmConfig,
      this.config.openaiBaseUrl,
      this.config.sumopodBaseUrl,
    )
    if (!model) {
      throw new Error(`Model tidak ditemukan: ${describeLlm(this.llmConfig)}`)
    }

    const auth = await this.modelRegistry.getApiKeyAndHeaders(model)
    const apiKey = auth.ok ? auth.apiKey : undefined
    if (!apiKey) {
      throw new Error(
        `API key tidak ditemukan untuk provider "${this.llmConfig.provider}". ` +
          `Set OPENAI_API_KEY atau SUMOPOD_API_KEY di .env`,
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

    const history = ConversationRepo.getMessages(chatId, resolvedChannel) as Array<{
      role: string
      content: string
    }>
    const promptText = this.buildPromptText(history, customerName, message)

    let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null

    setWorkshopToolContext({ chatId, channel: resolvedChannel })
    try {
      const created = await this.createSession(systemPrompt, model)
      session = created.session

      let finalText = await this.executeAgentSession(session, promptText, options.onChunk)

      if (!finalText.trim()) {
        finalText = FALLBACK_REPLY
        await this.escalate(chatId, customerName, message, resolvedChannel)
      }

      this.saveConversation(chatId, resolvedChannel, history, message, finalText)
      return finalText
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[LLM] Error:', msg)
      throw err
    } finally {
      clearWorkshopToolContext()
      session?.dispose()
    }
  }

  async processMessage(
    chatId: string,
    customerName: string,
    message: string,
    channel?: string,
  ): Promise<string> {
    return this.processMessageCore(chatId, customerName, message, {
      channel: channel as Channel | undefined,
    })
  }

  async processMessageStream(
    chatId: string,
    customerName: string,
    message: string,
    onChunk: (delta: string, accumulated: string) => void,
  ): Promise<string> {
    return this.processMessageCore(chatId, customerName, message, { onChunk })
  }

  private async escalate(
    chatId: string,
    customerName: string,
    message: string,
    channel: Channel,
  ): Promise<void> {
    await handleWorkshopTool({
      name: 'escalate_to_montir',
      args: { customer_name: customerName, summary: message, channel },
    })
  }
}