import { useState, useRef, useEffect } from 'react'

interface Props {
  workshopName: string
  statusText: string
  isOnline: boolean
  isTyping: boolean
  onNewSession: () => void
  onEditName: () => void
}

export function ChatHeader({
  workshopName,
  statusText,
  isOnline,
  isTyping,
  onNewSession,
  onEditName,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleNewSession = () => {
    setMenuOpen(false)
    onNewSession()
  }

  const handleEditName = () => {
    setMenuOpen(false)
    onEditName()
  }

  return (
    <header className="chat-header">
      <div className="header-left">
        <a href="/" className="back-link" aria-label="Kembali ke beranda">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <img src="/logo.svg" alt="" className="header-avatar" width="40" height="40" />
        <div className="header-info">
          <h1 className="header-name">{workshopName}</h1>
          <p className={`header-status ${isOnline ? 'online' : 'offline'}`}>
            {isTyping ? (
              <>
                <span className="status-dot typing" />
                mengetik...
              </>
            ) : (
              <>
                <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                {isOnline ? 'online' : statusText}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="header-right" ref={menuRef}>
        <button
          type="button"
          className="menu-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="menu-dropdown">
            <button type="button" className="menu-item" onClick={handleNewSession}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Sesi Baru
            </button>
            <button type="button" className="menu-item" onClick={handleEditName}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ganti Nama
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
