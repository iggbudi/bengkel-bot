/**
 * SumoPod Custom Provider for pi SDK
 * ------------------------------------
 * Registers MiniMax 2.7B HighSpeed as an OpenAI-compatible model
 * in pi SDK's ModelRegistry.
 *
 * SumoPod exposes OpenAI-compatible endpoints, so we map:
 *   - baseURL  → SUMOPOD_BASE_URL (e.g. https://open.sumopod.com/v1)
 *   - apiKey   → SUMOPOD_API_KEY
 *   - model    → minimax-2.7-highspeed (SumoPod's model alias)
 *
 * Usage in ModelRegistry:
 *   registry.registerProvider(new SumoPodProvider(apiKey, baseUrl))
 *   registry.registerModel('sumopod', 'minimax-2.7-highspeed', {
 *     contextWindow: 128_000,
 *     cost: { input: 0.1, output: 0.3 },  // per 1M tokens, adjust to your plan
 *     supportsTools: true,
 *     supportsStreaming: true,
 *   })
 */

import { z } from 'zod'
import type { Model } from '@earendil-works/pi-ai'

// Note: The detailed ApiInterface / chat types were internal to older pi-ai.
// This class is provided for documentation / future use with registerProvider.
// It is not actively instantiated in the current BengkelBot (runtime keys + ModelRegistry.find suffice).
// We use loose typing here for compatibility across pi-ai versions.

export const SUMOPOD_DEFAULT_BASE_URL = 'https://ai.sumopod.com/v1'
export const SUMOPOD_DEFAULT_MODEL = 'minimax-2.7-highspeed'

/** Strip optional provider prefix — SumoPod API expects bare model id e.g. deepseek-v4-pro */
export function normalizeSumoPodModelId(modelId: string): string {
  return modelId.replace(/^sumopod\//, '')
}

/**
 * Build an OpenAI-compatible Model for SumoPod (not in pi-ai built-in registry).
 */
export function createSumoPodModel(
  modelId: string,
  baseUrl = SUMOPOD_DEFAULT_BASE_URL
): Model<'openai-completions'> {
  const id = normalizeSumoPodModelId(modelId)
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider: 'sumopod',
    baseUrl: baseUrl.replace(/\/$/, ''),
    reasoning: id.includes('deepseek'),
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  }
}

// ── Types matching pi-ai's type system ────────────────────────────────────

export type SumoPodMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer'
  content: string
  name?: string
  toolCallId?: string
  toolCalls?: Array<{
    id: string
    name: string
    args: Record<string, unknown>
  }>
}

export interface SumoPodTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// ── API shapes ─────────────────────────────────────────────────────────────

const ToolCallFunctionSchema = z.object({
  name: z.string(),
  arguments: z.string(), // JSON string
})

const ToolCallSchema = z.object({
  id: z.string(),
  function: ToolCallFunctionSchema,
})

const ToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.unknown()),
  }),
})

const UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
})

const ChatCompletionMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
})

const ChatCompletionChunkSchema = z.object({
  id: z.string(),
 Choices: z.array(
    z.object({
      index: z.number(),
      delta: z.object({
        role: z.string().optional(),
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              index: z.number(),
              id: z.string(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            })
          )
          .optional(),
      }),
      finish_reason: z.string().nullable().optional(),
    })
  ),
  model: z.string().optional(),
  created: z.number().optional(),
})

// ── Provider class ──────────────────────────────────────────────────────────

export class SumoPodProvider {
  readonly apiKey: string
  readonly baseURL: string
  readonly model: string

  constructor(apiKey: string, baseURL = SUMOPOD_DEFAULT_BASE_URL, model = SUMOPOD_DEFAULT_MODEL) {
    this.apiKey = apiKey
    this.baseURL = baseURL.replace(/\/$/, '') // strip trailing slash
    this.model = model
  }

  // ── Internal fetch helper ─────────────────────────────────────────────

  private async fetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseURL}${path}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, model: this.model }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SumoPod API error ${res.status}: ${text}`)
    }

    return res.json() as Promise<T>
  }

  // ── Non-streaming chat ────────────────────────────────────────────────

  async chat(
    messages: SumoPodMessage[],
    tools?: SumoPodTool[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ content: string; toolCalls?: SumoPodMessage['toolCalls']; usage?: unknown }> {
    const body: Record<string, unknown> = {
      messages,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
      stream: false,
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    const data = await this.fetch<{
      choices: Array<{
        message: z.infer<typeof ChatCompletionMessageSchema>
        finish_reason: string
      }>
      usage: z.infer<typeof UsageSchema>
    }>('/chat/completions', body)

    const choice = data.choices[0]
    const msg = choice.message

    return {
      content: msg.content ?? '',
      toolCalls: msg.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
      usage: data.usage,
    }
  }

  // ── Streaming chat ───────────────────────────────────────────────────

  async *streamChat(
    messages: SumoPodMessage[],
    tools?: SumoPodTool[],
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<any> {
    const body: Record<string, unknown> = {
      messages,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
      stream: true,
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    const url = `${this.baseURL}/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, model: this.model }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SumoPod streaming error ${res.status}: ${text}`)
    }

    if (!res.body) throw new Error('Streaming response body is null')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]' || trimmed.startsWith('data: ')) {
            if (trimmed === 'data: [DONE]') yield { kind: 'done' }
            continue
          }

          const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
          try {
            const chunk = ChatCompletionChunkSchema.parse(JSON.parse(jsonStr))
            const delta = chunk.Choices[0]?.delta

            if (!delta) continue

            if (delta.content) {
              yield { kind: 'content', text: delta.content }
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  kind: 'tool_call',
                  id: tc.id,
                  name: tc.function.name,
                  args: tc.function.arguments,
                }
              }
            }
            if (chunk.Choices[0]?.finish_reason) {
              yield { kind: 'done' }
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // ── pi SDK Provider interface ─────────────────────────────────────────

  /**
   * Returns an ApiInterface compatible with pi-ai's Model<T> system.
   * This is what gets registered in ModelRegistry.
   */
  api(): any {
    const provider = this

    return {
      async chat(opts: any) {
        const messages: SumoPodMessage[] = opts.messages.map((m: any) => ({
          role: m.role as SumoPodMessage['role'],
          content: m.content,
          name: m.name,
          toolCallId: m.toolCallId,
          toolCalls: m.toolCalls as SumoPodMessage['toolCalls'],
        }))

        const tools: SumoPodTool[] | undefined = opts.tools?.map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        }))

        if (opts.stream) {
          const events = provider.streamChat(messages, tools, {
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
          })

          return {
            async *stream() {
              let accumulated = ''
              for await (const event of events) {
                if (event.kind === 'content') {
                  accumulated += event.text
                  yield { type: 'content', content: accumulated }
                } else if (event.kind === 'tool_call') {
                  yield {
                    type: 'tool_call',
                    id: event.id,
                    name: event.name,
                    arguments: event.args,
                  } as unknown as ReturnType<AsyncGenerator['next']> extends Promise<{ value: infer V }> ? V : never
                } else if (event.kind === 'done') {
                  yield { type: 'done' } as unknown as ReturnType<AsyncGenerator['next']> extends Promise<{ value: infer V }> ? V : never
                }
              }
            },
          }
        }

        const result = await provider.chat(messages, tools, {
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        })

        return {
          content: result.content,
          toolCalls: result.toolCalls?.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.args,
          })),
        }
      },
    }
  }
}
