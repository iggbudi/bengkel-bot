const messagesEl = document.querySelector('#messages')
const formEl = document.querySelector('#chatForm')
const inputEl = document.querySelector('#messageInput')
const sendBtn = document.querySelector('#sendBtn')
const newSessionBtn = document.querySelector('#newSessionBtn')
const statusEl = document.querySelector('#status')
const customerNameInput = document.querySelector('#customerNameInput')

const chatIdKey = 'bengkelbot.chatId'
const customerNameKey = 'bengkelbot.customerName'
let chatId = getOrCreateChatId()
let messages = []
let busy = false
let syncing = true
let currentBotBubble = null

const QUICK_PROMPTS = [
  'Service completo berapa harganya?',
  'Mau booking besok jam 9 pagi',
  'Rem depan bunyi aneh, kenapa ya?',
  'Jam buka dan alamat bengkel?',
]

initCustomerName()
boot()

customerNameInput?.addEventListener('change', saveCustomerName)
customerNameInput?.addEventListener('blur', saveCustomerName)

formEl.addEventListener('submit', async (event) => {
  event.preventDefault()
  const message = inputEl.value.trim()
  if (!message || busy || syncing) return

  inputEl.value = ''
  addMessage('user', message)
  await sendMessage(message)
})

newSessionBtn.addEventListener('click', () => {
  if (busy || syncing) return
  if (!confirm('Mulai percakapan baru? Bot tidak akan mengingat pesan sebelumnya.')) return
  startNewSession()
})

async function boot() {
  syncing = true
  setBusy(false)
  renderMessages()
  await Promise.all([syncHistory(), checkHealth()])
  syncing = false
  setBusy(busy)
  renderMessages()
  await handleInitialQuery()
}

async function syncHistory() {
  try {
    const res = await fetch(`/api/chat/history?chatId=${encodeURIComponent(chatId)}`)
    if (!res.ok) return
    const data = await res.json()
    messages = (data.messages || []).map(normalizeServerMessage)
  } catch {
    messages = []
  }
}

function normalizeServerMessage(entry) {
  const role =
    entry.role === 'assistant' ? 'bot' : entry.role === 'user' ? 'user' : entry.role
  return {
    role,
    text: entry.content ?? entry.text ?? '',
    at: entry.at ?? 0,
  }
}

function startNewSession() {
  chatId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem(chatIdKey, chatId)
  messages = []
  renderMessages()
  customerNameInput?.focus()
}

function initCustomerName() {
  if (!customerNameInput) return
  customerNameInput.value = localStorage.getItem(customerNameKey) || ''
}

function saveCustomerName() {
  if (!customerNameInput) return
  const name = customerNameInput.value.trim()
  if (name) localStorage.setItem(customerNameKey, name)
  else localStorage.removeItem(customerNameKey)
  if (!syncing) renderMessages()
}

function getCustomerName() {
  const fromInput = customerNameInput?.value?.trim()
  if (fromInput) return fromInput
  const stored = localStorage.getItem(customerNameKey)?.trim()
  if (stored) return stored
  return 'Pelanggan'
}

function getOrCreateChatId() {
  const existing = localStorage.getItem(chatIdKey)
  if (existing) return existing
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem(chatIdKey, id)
  return id
}

function addMessage(role, text) {
  messages.push({ role, text, at: Date.now() })
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

  if (syncing) {
    const loading = document.createElement('div')
    loading.className = 'empty'
    loading.textContent = 'Memuat riwayat chat...'
    messagesEl.appendChild(loading)
    return
  }

  if (messages.length === 0 && !currentBotBubble) {
    const empty = document.createElement('div')
    empty.className = 'empty'

    const title = document.createElement('p')
    title.className = 'empty-title'
    const name = getCustomerName()
    title.textContent = name !== 'Pelanggan' ? `Halo, ${name}! Ada yang bisa dibantu?` : 'Halo! Ada yang bisa dibantu?'

    const desc = document.createElement('p')
    desc.className = 'empty-desc'
    desc.textContent = 'Tanya harga, booking service, atau cek status perbaikan.'

    const prompts = document.createElement('div')
    prompts.className = 'empty-prompts'
    for (const text of QUICK_PROMPTS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'empty-prompt'
      btn.textContent = text
      btn.addEventListener('click', () => {
        if (busy || syncing) return
        addMessage('user', text)
        sendMessage(text)
      })
      prompts.appendChild(btn)
    }

    empty.append(title, desc, prompts)
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
  const empty = messagesEl.querySelector('.empty')
  if (empty) empty.remove()

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

function applyBranding(data) {
  const name = data?.workshop?.trim() || data?.bot?.trim() || 'CMaestro'
  const titleEl = document.querySelector('#app-title')
  if (titleEl) titleEl.textContent = name
  document.title = `Chat — ${name}`
}

async function handleInitialQuery() {
  const params = new URLSearchParams(window.location.search)
  const query = params.get('q')?.trim()
  if (!query || busy || syncing) return

  window.history.replaceState({}, '', '/chat')
  addMessage('user', query)
  await sendMessage(query)
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    applyBranding(data)
    statusEl.textContent = data.ok
      ? (data.tagline || 'Asisten pintar bengkel mobil Anda')
      : `Konfigurasi belum lengkap: ${data.configError}`
    statusEl.style.color = data.ok ? '' : 'var(--danger)'
  } catch {
    statusEl.textContent = 'Server tidak tersambung'
    statusEl.style.color = 'var(--danger)'
  }
}

async function sendMessage(message) {
  saveCustomerName()
  setBusy(true)
  currentBotBubble = createBotBubble()

  const params = new URLSearchParams({
    chatId,
    customerName: getCustomerName(),
    message,
  })

  try {
    const eventSource = new EventSource(`/api/chat?${params}`)
    let finalText = ''

    await new Promise((resolve, reject) => {
      eventSource.addEventListener('start', () => {})

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
      if (currentBotBubble?.parentNode) currentBotBubble.remove()
    }
  } catch (err) {
    setErrorBubble(err.message || 'Maaf, ada gangguan teknis.')
    messages.push({
      role: 'error',
      text: err.message || 'Maaf, ada gangguan teknis.',
      at: Date.now(),
    })
    renderMessages()
  } finally {
    currentBotBubble = null
    setBusy(false)
    inputEl.focus()
  }
}

function setBusy(value) {
  busy = value
  inputEl.disabled = value || syncing
  sendBtn.disabled = value || syncing
  if (customerNameInput) customerNameInput.disabled = value || syncing
  if (newSessionBtn) newSessionBtn.disabled = value || syncing
  if (!value) renderMessages()
}