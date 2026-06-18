const messagesEl = document.querySelector('#messages')
const formEl = document.querySelector('#chatForm')
const inputEl = document.querySelector('#messageInput')
const sendBtn = document.querySelector('#sendBtn')
const clearBtn = document.querySelector('#clearBtn')
const statusEl = document.querySelector('#status')

const chatIdKey = 'bengkelbot.chatId'
const messagesKey = 'bengkelbot.messages'
const chatId = getOrCreateChatId()
let messages = loadMessages()
let busy = false
let currentBotBubble = null

renderMessages()
checkHealth()

formEl.addEventListener('submit', async (event) => {
  event.preventDefault()
  const message = inputEl.value.trim()
  if (!message || busy) return

  inputEl.value = ''
  addMessage('user', message)
  await sendMessage(message)
})

clearBtn.addEventListener('click', () => {
  if (!confirm('Hapus chat lokal di browser? History di database server tidak ikut dihapus.')) return
  messages = []
  saveMessages()
  renderMessages()
})

function getOrCreateChatId() {
  const existing = localStorage.getItem(chatIdKey)
  if (existing) return existing
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem(chatIdKey, id)
  return id
}

function loadMessages() {
  try {
    return JSON.parse(localStorage.getItem(messagesKey) || '[]')
  } catch {
    return []
  }
}

function saveMessages() {
  localStorage.setItem(messagesKey, JSON.stringify(messages.slice(-100)))
}

function addMessage(role, text) {
  messages.push({ role, text, at: Date.now() })
  saveMessages()
  renderMessages()
}

function renderMarkdown(text) {
  try {
    return marked.parse(text, { breaks: true, gfm: true })
  } catch {
    return text
  }
}

function renderMessages() {
  messagesEl.innerHTML = ''

  if (messages.length === 0 && !currentBotBubble) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Mulai test chatbot bengkel. Contoh: "service completo berapa?", "cek status B1234CD", atau "mau booking besok jam 9".'
    messagesEl.appendChild(empty)
    return
  }

  for (const msg of messages) {
    const div = document.createElement('div')
    div.className = `message ${msg.role}`
    if (msg.role === 'bot') {
      div.innerHTML = renderMarkdown(msg.text)
    } else {
      div.textContent = msg.text
    }
    messagesEl.appendChild(div)
  }

  scrollToBottom()
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function createBotBubble() {
  const div = document.createElement('div')
  div.className = 'message bot'
  div.textContent = ''
  messagesEl.appendChild(div)
  scrollToBottom()
  return div
}

function updateBotBubble(text) {
  if (!currentBotBubble) return
  currentBotBubble.innerHTML = renderMarkdown(text)
  scrollToBottom()
}

function setErrorBubble(text) {
  if (!currentBotBubble) return
  currentBotBubble.className = 'message error'
  currentBotBubble.textContent = text
  scrollToBottom()
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    statusEl.textContent = data.ok
      ? `${data.workshop} • ${data.llm}`
      : `Konfigurasi belum lengkap: ${data.configError}`
    statusEl.style.color = data.ok ? '' : 'var(--danger)'
  } catch {
    statusEl.textContent = 'Server tidak tersambung'
    statusEl.style.color = 'var(--danger)'
  }
}

async function sendMessage(message) {
  setBusy(true)
  currentBotBubble = createBotBubble()

  const params = new URLSearchParams({
    chatId,
    customerName: 'Web Tester',
    message,
  })

  try {
    const eventSource = new EventSource(`/api/chat?${params}`)
    let finalText = ''

    await new Promise((resolve, reject) => {
      eventSource.addEventListener('start', () => {
        // stream started
      })

      eventSource.addEventListener('delta', (e) => {
        try {
          const data = JSON.parse(e.data)
          finalText = data.text || finalText
          updateBotBubble(finalText)
        } catch {}
      })

      eventSource.addEventListener('done', (e) => {
        try {
          const data = JSON.parse(e.data)
          finalText = data.text || finalText
        } catch {}
        eventSource.close()
        resolve()
      })

      eventSource.addEventListener('error', (e) => {
        if (eventSource.readyState === EventSource.CLOSED) {
          if (!finalText) reject(new Error('Koneksi terputus'))
          else resolve()
          return
        }
        try {
          const data = JSON.parse(e.data)
          eventSource.close()
          reject(new Error(data.error || 'Error tidak diketahui'))
        } catch {
          eventSource.close()
          reject(new Error('Koneksi terputus'))
        }
      })

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          if (!finalText) reject(new Error('Koneksi terputus'))
          else resolve()
        }
      }
    })

    if (finalText) {
      addMessage('bot', finalText)
      // remove the live bubble since addMessage re-renders everything
      if (currentBotBubble && currentBotBubble.parentNode) {
        currentBotBubble.remove()
      }
    }
  } catch (err) {
    setErrorBubble(err.message || 'Maaf, ada gangguan teknis.')
    messages.push({ role: 'error', text: err.message || 'Maaf, ada gangguan teknis.', at: Date.now() })
    saveMessages()
  } finally {
    currentBotBubble = null
    setBusy(false)
    inputEl.focus()
  }
}

function setBusy(value) {
  busy = value
  inputEl.disabled = value
  sendBtn.disabled = value
  if (!value) renderMessages()
}
