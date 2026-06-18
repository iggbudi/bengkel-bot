/**
 * LLM Provider Configuration
 * Resolves which provider/model to use from env + BotConfig.
 */

import type { Api, Model } from '@earendil-works/pi-ai'
import type { ModelRegistry } from '@earendil-works/pi-coding-agent'
import { OPENAI_GPT_5_4_MINI, OPENAI_GPT_5_4_MINI_ID } from '../providers/openai.js'

export type LlmProvider = 'openai' | 'sumopod'

export interface LlmConfig {
  provider: LlmProvider
  modelId: string
}

export interface LlmEnvConfig {
  llmProvider: LlmProvider
  llmModel: string
  openaiApiKey?: string
  openaiBaseUrl: string
  sumopodApiKey?: string
  sumopodBaseUrl: string
}

const SUMOPOD_MODEL_ID = 'minimax-2.7-highspeed'

export function resolveLlmEnv(): LlmEnvConfig {
  const provider = (process.env.LLM_PROVIDER ?? 'openai') as LlmProvider
  const model = process.env.LLM_MODEL ?? (
    provider === 'openai' ? OPENAI_GPT_5_4_MINI_ID : SUMOPOD_MODEL_ID
  )

  return {
    llmProvider: provider,
    llmModel: model,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    sumopodApiKey: process.env.SUMOPOD_API_KEY,
    sumopodBaseUrl: process.env.SUMOPOD_BASE_URL ?? 'https://open.sumopod.com/v1',
  }
}

export function toLlmConfig(env: LlmEnvConfig): LlmConfig {
  return {
    provider: env.llmProvider,
    modelId: env.llmModel,
  }
}

/**
 * Resolve the pi SDK Model object for the configured provider.
 */
export function resolveModel(
  registry: ModelRegistry,
  config: LlmConfig,
  openaiBaseUrl?: string
): Model<Api> | undefined {
  if (config.provider === 'openai') {
    if (config.modelId === OPENAI_GPT_5_4_MINI_ID) {
      return openaiBaseUrl && openaiBaseUrl !== 'https://api.openai.com/v1'
        ? { ...OPENAI_GPT_5_4_MINI, baseUrl: openaiBaseUrl.replace(/\/$/, '') }
        : OPENAI_GPT_5_4_MINI
    }

    // Fallback: built-in OpenAI models in pi-ai (gpt-5-mini, gpt-5.2, etc.)
    return registry.find('openai', config.modelId)
  }

  return registry.find('sumopod', config.modelId)
}

export function describeLlm(config: LlmConfig): string {
  return `${config.provider}/${config.modelId}`
}