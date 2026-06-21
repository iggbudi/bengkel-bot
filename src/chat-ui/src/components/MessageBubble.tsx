import { useState } from 'react'
import type { Message } from '../types'
import { renderMarkdown } from '../lib/markdown'

function formatTime(at: number | null): string {
  if (!at) return ''
  const d = new Date(at)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function ReadReceipt({ status }: { status?: string }) {
  if (!status) return null

  if (status === 'sending') {
    return (
      <svg className="receipt receipt-single" width="16" height="12" viewBox="0 0 16 12" fill="none">
        <path d="M1 6l4 4 10-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  const isRead = status === 'read'
  return (
    <svg className={`receipt ${isRead ? 'receipt-read' : ''}`} width="18" height="12" viewBox="0 0 18 12" fill="none">
      <path d="M1 6l4 4 10-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6l4 4 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard not available */
    }
  }

  const isUser = message.role === 'user'
  const isError = message.role === 'error'

  return (
    <div className={`message-wrap ${message.role}`}>
      <div className={`message ${message.role}`}>
        {message.role === 'bot' ? (
          <div
            className="message-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
          />
        ) : (
          <div className="message-text">{message.text}</div>
        )}
        <div className="message-meta">
          <span className="message-time">{formatTime(message.at)}</span>
          {isUser && <ReadReceipt status={message.status} />}
        </div>
      </div>
      {!isError && (
        <button
          type="button"
          className={`copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          aria-label="Salin pesan"
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
