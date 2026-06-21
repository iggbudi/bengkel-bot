import { useRef, useEffect, useState } from 'react'
import type { Message } from '../types'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { EmptyState } from './EmptyState'
import { ScrollToBottom } from './ScrollToBottom'

interface Props {
  messages: Message[]
  phase: 'syncing' | 'idle' | 'streaming'
  isTyping: boolean
  streamingText: string
  customerName: string
  onPromptClick: (text: string) => void
}

function LoadingSkeleton() {
  return (
    <div className="skeleton-list">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`skeleton-bubble ${i % 2 === 0 ? 'left' : 'right'}`}>
          <div className="skeleton-line" style={{ width: `${60 + i * 10}%` }} />
          <div className="skeleton-line" style={{ width: `${40 + i * 5}%` }} />
        </div>
      ))}
    </div>
  )
}

export function MessageList({
  messages,
  phase,
  isTyping,
  streamingText,
  customerName,
  onPromptClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const wasAtBottomRef = useRef(true)

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollToBottom()
    }
  }, [messages, isTyping, streamingText])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    wasAtBottomRef.current = atBottom
    setShowScrollBtn(!atBottom)
  }

  const isEmpty = messages.length === 0 && !isTyping && !streamingText

  return (
    <div className="messages-area" ref={scrollRef} onScroll={handleScroll}>
      <div className="messages-inner">
        {phase === 'syncing' ? (
          <LoadingSkeleton />
        ) : isEmpty ? (
          <EmptyState customerName={customerName} onPromptClick={onPromptClick} />
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isTyping && !streamingText && <TypingIndicator />}
            {streamingText && (
              <MessageBubble
                message={{
                  id: 'streaming',
                  role: 'bot',
                  text: streamingText,
                  at: Date.now(),
                }}
              />
            )}
          </>
        )}
      </div>
      <ScrollToBottom visible={showScrollBtn} onClick={scrollToBottom} />
    </div>
  )
}
