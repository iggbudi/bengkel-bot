import { useState } from 'react'

interface Props {
  onSubmit: (name: string) => void
  initialName?: string
}

export function NameModal({ onSubmit, initialName }: Props) {
  const [name, setName] = useState(initialName || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <div className="modal-overlay">
      <form className="name-modal" onSubmit={handleSubmit}>
        <div className="name-modal-logo">
          <img src="/logo.svg" alt="" width="56" height="56" />
        </div>
        <h2 className="name-modal-title">Selamat datang!</h2>
        <p className="name-modal-desc">Sebelum mulai, siapa nama Anda?</p>
        <input
          type="text"
          className="name-modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama Anda"
          autoComplete="name"
          maxLength={60}
          autoFocus
        />
        <button type="submit" className="name-modal-btn" disabled={!name.trim()}>
          Mulai Chat
        </button>
      </form>
    </div>
  )
}
