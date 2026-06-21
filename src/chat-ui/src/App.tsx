import { useEffect, useRef, useState } from 'react'
import { useChat } from './hooks/useChat'
import { useHealth } from './hooks/useHealth'
import { ChatHeader } from './components/ChatHeader'
import { MessageList } from './components/MessageList'
import { Composer } from './components/Composer'
import { NameModal } from './components/NameModal'
import {
  getCustomerName,
  setCustomerName,
  hasCustomerName,
} from './lib/storage'

export default function App() {
  const { messages, phase, isTyping, streamingText, syncHistory, sendMessage, startNewSession } =
    useChat()
  const { data: healthData, isOnline, statusText } = useHealth()

  const [showNameModal, setShowNameModal] = useState(!hasCustomerName())
  const [customerName, setCustomerNameState] = useState(getCustomerName())
  const initialQueryHandled = useRef(false)

  useEffect(() => {
    syncHistory()
  }, [syncHistory])

  useEffect(() => {
    if (phase === 'idle' && !showNameModal && !initialQueryHandled.current) {
      initialQueryHandled.current = true
      handleInitialQuery()
    }
  }, [phase, showNameModal])

  function handleInitialQuery() {
    const params = new URLSearchParams(window.location.search)
    const query = params.get('q')?.trim()
    if (!query) return
    window.history.replaceState({}, '', '/chat')
    sendMessage(query)
  }

  function handleNameSubmit(name: string) {
    setCustomerName(name)
    setCustomerNameState(name)
    setShowNameModal(false)
  }

  function handleNewSession() {
    if (phase !== 'idle') return
    if (!confirm('Mulai percakapan baru? Bot tidak akan mengingat pesan sebelumnya.')) return
    startNewSession()
  }

  function handleEditName() {
    setShowNameModal(true)
  }

  const workshopName = healthData?.workshop?.trim() || healthData?.bot?.trim() || 'CMaestro'
  const composerDisabled = phase !== 'idle' || showNameModal

  return (
    <div className="chat-app">
      <ChatHeader
        workshopName={workshopName}
        statusText={statusText}
        isOnline={isOnline}
        isTyping={isTyping || !!streamingText}
        onNewSession={handleNewSession}
        onEditName={handleEditName}
      />
      <MessageList
        messages={messages}
        phase={phase}
        isTyping={isTyping}
        streamingText={streamingText}
        customerName={customerName}
        onPromptClick={sendMessage}
      />
      <Composer onSend={sendMessage} disabled={composerDisabled} />
      {showNameModal && (
        <NameModal onSubmit={handleNameSubmit} initialName={customerName} />
      )}
    </div>
  )
}
