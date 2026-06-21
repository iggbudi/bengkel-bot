import { useReducer, useRef, useCallback } from 'react'
import type { Message, ServerMessage } from '../types'
import { fetchHistory, streamChat } from '../lib/api'
import { getChatId, setChatId, getCustomerName } from '../lib/storage'

interface ChatState {
  messages: Message[]
  phase: 'syncing' | 'idle' | 'streaming'
  isTyping: boolean
  streamingText: string
}

type ChatAction =
  | { type: 'SYNC_START' }
  | { type: 'SYNC_DONE'; messages: Message[] }
  | { type: 'SEND_MESSAGE'; message: Message }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_DELTA'; text: string }
  | { type: 'STREAM_DONE'; text: string }
  | { type: 'STREAM_ERROR'; text: string }
  | { type: 'NEW_SESSION' }

function genId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeServerMessage(entry: ServerMessage, index: number): Message {
  const role = entry.role === 'assistant' ? 'bot' : entry.role === 'user' ? 'user' : entry.role
  return {
    id: `hist-${index}`,
    role: role as Message['role'],
    text: entry.content ?? '',
    at: entry.at ?? null,
  }
}

function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SYNC_START':
      return { ...state, phase: 'syncing' }

    case 'SYNC_DONE':
      return { ...state, messages: action.messages, phase: 'idle' }

    case 'SEND_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.message],
        phase: 'streaming',
        isTyping: true,
        streamingText: '',
      }

    case 'STREAM_START':
      return {
        ...state,
        messages: state.messages.map((m, i) =>
          i === state.messages.length - 1 && m.role === 'user'
            ? { ...m, status: 'delivered' }
            : m,
        ),
      }

    case 'STREAM_DELTA':
      return {
        ...state,
        streamingText: action.text,
        isTyping: false,
        messages: state.messages.map((m, i) =>
          i === state.messages.length - 1 && m.role === 'user'
            ? { ...m, status: 'read' }
            : m,
        ),
      }

    case 'STREAM_DONE': {
      const botMessage: Message = {
        id: genId(),
        role: 'bot',
        text: action.text,
        at: Date.now(),
      }
      return {
        ...state,
        messages: [...state.messages, botMessage],
        phase: 'idle',
        isTyping: false,
        streamingText: '',
      }
    }

    case 'STREAM_ERROR': {
      const errorMessage: Message = {
        id: genId(),
        role: 'error',
        text: action.text,
        at: Date.now(),
      }
      return {
        ...state,
        messages: [...state.messages, errorMessage],
        phase: 'idle',
        isTyping: false,
        streamingText: '',
      }
    }

    case 'NEW_SESSION':
      return { ...state, messages: [], phase: 'idle', isTyping: false, streamingText: '' }

    default:
      return state
  }
}

const initialState: ChatState = {
  messages: [],
  phase: 'syncing',
  isTyping: false,
  streamingText: '',
}

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const chatIdRef = useRef(getChatId())
  const closeStreamRef = useRef<(() => void) | null>(null)

  const syncHistory = useCallback(async () => {
    dispatch({ type: 'SYNC_START' })
    try {
      const raw = await fetchHistory(chatIdRef.current)
      const messages = raw.map(normalizeServerMessage)
      dispatch({ type: 'SYNC_DONE', messages })
    } catch {
      dispatch({ type: 'SYNC_DONE', messages: [] })
    }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const userMessage: Message = {
      id: genId(),
      role: 'user',
      text,
      at: Date.now(),
      status: 'sending',
    }
    dispatch({ type: 'SEND_MESSAGE', message: userMessage })

    const customerName = getCustomerName() || 'Pelanggan'

    closeStreamRef.current = streamChat(
      chatIdRef.current,
      customerName,
      text,
      {
        onStart: () => dispatch({ type: 'STREAM_START' }),
        onDelta: (t: string) => dispatch({ type: 'STREAM_DELTA', text: t }),
        onDone: (t: string) => dispatch({ type: 'STREAM_DONE', text: t }),
        onError: (err: string) => dispatch({ type: 'STREAM_ERROR', text: err }),
      },
    )
  }, [])

  const startNewSession = useCallback(() => {
    if (closeStreamRef.current) {
      closeStreamRef.current()
      closeStreamRef.current = null
    }
    const newId = genId()
    setChatId(newId)
    chatIdRef.current = newId
    dispatch({ type: 'NEW_SESSION' })
  }, [])

  return {
    messages: state.messages,
    phase: state.phase,
    isTyping: state.isTyping,
    streamingText: state.streamingText,
    syncHistory,
    sendMessage,
    startNewSession,
  }
}
