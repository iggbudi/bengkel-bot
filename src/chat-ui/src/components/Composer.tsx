import { useRef, useState } from 'react'
import { useAutoResize } from '../hooks/useAutoResize'

interface Props {
  onSend: (text: string) => void
  disabled: boolean
}

export function Composer({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useAutoResize(textareaRef, value)

  const canSend = value.trim().length > 0 && !disabled

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleAttach = () => {
    alert('Fitur lampiran segera hadir')
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <button
        type="button"
        className="attach-btn"
        onClick={handleAttach}
        aria-label="Lampirkan file"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <textarea
        ref={textareaRef}
        className="composer-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Tulis pesan..."
        rows={1}
        disabled={disabled}
      />
      <button
        type="submit"
        className="send-btn"
        disabled={!canSend}
        aria-label="Kirim pesan"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </form>
  )
}
