/**
 * BengkelBot Admin Dashboard
 * --------------------------
 * Client-side routing + API calls.
 */

const sidebar = document.querySelector('#sidebar')
const sidebarOverlay = document.querySelector('#sidebar-overlay')
const menuBtn = document.querySelector('#menuBtn')
const titleEl = document.querySelector('#page-title')
const actionsEl = document.querySelector('#page-actions')
const bodyEl = document.querySelector('#page-body')
const navItems = document.querySelectorAll('.nav-item[data-page]')

let currentPage = ''
let dirty = false

function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches
}

function openSidebar() {
  sidebar?.classList.add('open')
  if (sidebarOverlay) sidebarOverlay.hidden = false
  document.body.classList.add('sidebar-open')
}

function closeSidebar() {
  sidebar?.classList.remove('open')
  if (sidebarOverlay) sidebarOverlay.hidden = true
  document.body.classList.remove('sidebar-open')
}

menuBtn?.addEventListener('click', () => {
  if (sidebar?.classList.contains('open')) closeSidebar()
  else openSidebar()
})

sidebarOverlay?.addEventListener('click', closeSidebar)

navItems.forEach((el) => {
  el.addEventListener('click', () => {
    if (isMobile()) closeSidebar()
  })
})

window.addEventListener('resize', () => {
  if (!isMobile()) closeSidebar()
})

// ── Routing ──────────────────────────────────────────────

function getHash() {
  return window.location.hash.slice(1) || 'kb/faq'
}

function navigate(page) {
  window.location.hash = page
}

window.addEventListener('hashchange', () => {
  const page = getHash()
  if (page === currentPage) return
  if (dirty && !confirm('Ada perubahan belum disimpan. Yakin pindah halaman?')) {
    window.location.hash = currentPage
    return
  }
  loadPage(page)
})

// ── Nav Highlight ────────────────────────────────────────

function setActiveNav(page) {
  navItems.forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page)
  })
}

// ── Toast ────────────────────────────────────────────────

function toast(message, type = 'success') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ── API Helpers ──────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(`/admin/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (res.status === 401 || res.status === 302) {
    window.location.href = '/admin/login'
    throw new Error('Session expired')
  }
  return res.json()
}

// ── Page Loader ──────────────────────────────────────────

async function loadPage(page) {
  currentPage = page
  dirty = false
  document.body.classList.remove('settings-page')
  setActiveNav(page)

  const [section, sub] = page.split('/')

  switch (section) {
    case 'kb':
      await loadKbPage(sub || 'faq')
      break
    case 'conversations':
      await loadConversationsPage()
      break
    case 'conversations/view':
      await loadConversationViewPage(sub)
      break
    case 'bookings':
      await loadBookingsPage()
      break
    case 'settings':
      await loadSettingsPage()
      break
    default:
      titleEl.textContent = '404'
      bodyEl.innerHTML = '<p>Halaman tidak ditemukan.</p>'
      actionsEl.innerHTML = ''
  }
}

// ── KB Editor ────────────────────────────────────────────

const KB_LABELS = {
  faq: 'FAQ',
  services: 'Layanan & Harga',
  slang: 'Slang Jawa',
  diagnostics: 'Panduan Diagnosa',
}

async function loadKbPage(name) {
  const label = KB_LABELS[name] || name
  titleEl.textContent = `📚 ${label}`
  actionsEl.innerHTML = `
    <div class="status-bar">
      <span class="status-dot saved" id="statusDot"></span>
      <span id="statusText">Tersimpan</span>
    </div>
    <button class="btn btn-primary" id="saveBtn" disabled>💾 Simpan</button>
  `

  bodyEl.innerHTML = `
    <div class="kb-tabs mobile-only" id="kbTabs">
      <button type="button" class="kb-tab active" data-tab="edit">✏️ Edit</button>
      <button type="button" class="kb-tab" data-tab="preview">👁️ Preview</button>
    </div>
    <div class="kb-editor show-edit" id="kbEditor">
      <div class="editor-pane card">
        <div class="card-header">
          <h3>Markdown Editor</h3>
        </div>
        <textarea id="editor" spellcheck="false" placeholder="Memuat konten..." readonly></textarea>
      </div>
      <div class="preview-pane card">
        <div class="card-header">
          <h3>Preview</h3>
        </div>
        <div class="preview-content" id="preview"><p class="kb-loading">Memuat preview...</p></div>
      </div>
    </div>
  `

  const kbEditor = document.querySelector('#kbEditor')
  const kbTabs = document.querySelector('#kbTabs')
  const editor = document.querySelector('#editor')
  const preview = document.querySelector('#preview')
  const saveBtn = document.querySelector('#saveBtn')
  const statusDot = document.querySelector('#statusDot')
  const statusText = document.querySelector('#statusText')

  function updatePreview() {
    if (typeof marked === 'undefined') {
      preview.innerHTML = '<p style="color:var(--danger)">Markdown renderer belum dimuat. Muat ulang halaman.</p>'
      return
    }
    const content = editor.value || ''
    preview.innerHTML = content.trim()
      ? marked.parse(content, { breaks: true, gfm: true })
      : '<p class="kb-loading">Belum ada konten.</p>'
  }

  function switchKbTab(tabName) {
    if (!kbEditor || !kbTabs) return
    kbTabs.querySelectorAll('.kb-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tabName)
    })
    kbEditor.classList.remove('show-edit', 'show-preview')
    kbEditor.classList.add(tabName === 'preview' ? 'show-preview' : 'show-edit')
    if (tabName === 'preview') updatePreview()
  }

  kbTabs?.addEventListener('click', (e) => {
    const tab = e.target.closest('.kb-tab')
    if (!tab) return
    switchKbTab(tab.dataset.tab)
  })

  function setClean() {
    dirty = false
    saveBtn.disabled = true
    statusDot.className = 'status-dot saved'
    statusText.textContent = 'Tersimpan'
  }

  function setDirty() {
    dirty = true
    saveBtn.disabled = false
    statusDot.className = 'status-dot unsaved'
    statusText.textContent = 'Belum disimpan'
  }

  const data = await api(`/kb/${name}`)
  if (!data.ok) {
    editor.value = ''
    editor.readOnly = false
    editor.placeholder = 'Gagal memuat konten'
    preview.innerHTML = `<p style="color:var(--danger)">Gagal memuat: ${data.error}</p>`
    statusDot.className = 'status-dot error'
    statusText.textContent = 'Gagal memuat'
    return
  }

  editor.value = data.content || ''
  editor.readOnly = false
  editor.placeholder = 'Tulis markdown di sini...'
  updatePreview()
  setClean()

  editor.addEventListener('input', () => {
    if (kbEditor?.classList.contains('show-preview')) updatePreview()
    setDirty()
  })

  // Tab support in textarea
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = editor.selectionStart
      const end = editor.selectionEnd
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end)
      editor.selectionStart = editor.selectionEnd = start + 2
      setDirty()
    }
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      saveBtn.click()
    }
  })

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true
    statusText.textContent = 'Menyimpan...'

    const result = await api(`/kb/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ content: editor.value }),
    })

    if (result.ok) {
      setClean()
      toast('Tersimpan ✓')
    } else {
      statusDot.className = 'status-dot error'
      statusText.textContent = 'Gagal menyimpan'
      toast(result.error || 'Gagal menyimpan', 'error')
      saveBtn.disabled = false
    }
  })
}

// ── Conversations ─────────────────────────────────────────

let convChannelFilter = ''

async function loadConversationsPage() {
  titleEl.textContent = '💬 Sesi Chat'
  actionsEl.innerHTML = `
    <div class="status-bar">
      <span id="convStats">Loading...</span>
    </div>
  `

  bodyEl.innerHTML = `
    <div class="filter-bar" id="convFilters"></div>
    <div class="card desktop-only">
      <table class="data-table" id="convTable">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Chat ID</th>
            <th>Pelanggan</th>
            <th>Pesan</th>
            <th>Preview</th>
            <th>Terakhir</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody id="convBody"></tbody>
      </table>
    </div>
    <div class="mobile-card-list mobile-only" id="convCards"></div>
  `

  const filtersEl = document.querySelector('#convFilters')
  const allChannels = ['', 'whatsapp', 'web', 'telegram']
  const channelLabels = { '': 'Semua', whatsapp: '📱 WhatsApp', web: '🌐 Web', telegram: '✈️ Telegram' }

  filtersEl.innerHTML = allChannels
    .map((c) => `<button class="filter-btn ${c === convChannelFilter ? 'active' : ''}" data-channel="${c}">${channelLabels[c]}</button>`)
    .join('')

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn')
    if (!btn) return
    convChannelFilter = btn.dataset.channel
    loadConversationsPage()
  })

  const [statsData, convData] = await Promise.all([
    api('/conversations/stats'),
    api(`/conversations${convChannelFilter ? `?channel=${convChannelFilter}` : ''}`),
  ])

  const statsEl = document.querySelector('#convStats')
  statsEl.textContent = `Total: ${statsData.total} | 24h: ${statsData.recentDay} | 1h: ${statsData.recentHour}`

  const tbody = document.querySelector('#convBody')
  const cardsEl = document.querySelector('#convCards')
  const emptyMsg = '<p style="text-align:center;color:var(--muted);padding:32px">Belum ada percakapan</p>'

  if (!convData.conversations?.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">Belum ada percakapan</td></tr>`
    if (cardsEl) cardsEl.innerHTML = emptyMsg
    return
  }

  if (tbody) {
    tbody.innerHTML = convData.conversations
      .map((c) => {
        const channelIcon = { whatsapp: '📱', web: '🌐', telegram: '✈️' }[c.channel] || '💬'
        const chatId = c.chat_id.replace(/^(web|whatsapp|telegram):/, '')
        const preview = c.last_message_preview
          ? escHtml(c.last_message_preview.length > 50 ? c.last_message_preview.slice(0, 50) + '...' : c.last_message_preview)
          : '-'
        const time = c.last_message_at ? new Date(c.last_message_at).toLocaleString('id-ID') : '-'

        return `
          <tr>
            <td>${channelIcon} ${c.channel}</td>
            <td><code style="font-size:12px">${escHtml(chatId)}</code></td>
            <td>${escHtml(c.customer_name || '-')}</td>
            <td>${c.message_count}</td>
            <td style="color:var(--muted);font-size:13px">${preview}</td>
            <td style="font-size:13px">${time}</td>
            <td><button class="btn btn-small btn-secondary view-conv-btn" data-id="${c.id}">👁️ Lihat</button></td>
          </tr>
        `
      })
      .join('')
  }

  if (cardsEl) {
    cardsEl.innerHTML = convData.conversations
      .map((c) => {
        const channelIcon = { whatsapp: '📱', web: '🌐', telegram: '✈️' }[c.channel] || '💬'
        const chatId = c.chat_id.replace(/^(web|whatsapp|telegram):/, '')
        const preview = c.last_message_preview
          ? escHtml(c.last_message_preview.length > 80 ? c.last_message_preview.slice(0, 80) + '...' : c.last_message_preview)
          : '-'
        const time = c.last_message_at ? new Date(c.last_message_at).toLocaleString('id-ID') : '-'

        return `
          <div class="mobile-card">
            <div class="mobile-card-header">
              <div>
                <div class="mobile-card-title">${channelIcon} ${escHtml(c.customer_name || chatId)}</div>
                <div class="mobile-card-meta"><code>${escHtml(chatId)}</code></div>
              </div>
              <span class="badge badge-approved">${c.message_count} pesan</span>
            </div>
            <div class="mobile-card-meta">${preview}</div>
            <div class="mobile-card-row">
              <span class="mobile-card-label">Terakhir</span>
              <span style="font-size:13px">${time}</span>
            </div>
            <button class="btn btn-secondary view-conv-btn" data-id="${c.id}" style="width:100%">👁️ Lihat Percakapan</button>
          </div>
        `
      })
      .join('')
  }

  document.querySelectorAll('.view-conv-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(`conversations/view/${btn.dataset.id}`)
    })
  })
}

async function loadConversationViewPage() {
  const id = window.location.hash.split('/').pop()
  if (!id) { navigate('conversations'); return }

  titleEl.textContent = '💬 Detail Chat'
  actionsEl.innerHTML = `<button class="btn btn-secondary" id="backToConvBtn" type="button">← Kembali</button>`

  bodyEl.innerHTML = '<p style="color:var(--muted)">Loading...</p>'

  document.querySelector('#backToConvBtn')?.addEventListener('click', () => navigate('conversations'))

  const data = await api(`/conversations/${id}`)
  if (!data.conversation) {
    bodyEl.innerHTML = '<p style="color:var(--danger)">Conversation tidak ditemukan.</p>'
    return
  }

  const c = data.conversation
  const channelIcon = { whatsapp: '📱', web: '🌐', telegram: '✈️' }[c.channel] || '💬'
  const chatId = c.chat_id.replace(/^(web|whatsapp|telegram):/, '')

  bodyEl.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>${channelIcon} ${escHtml(c.channel)} — <code>${escHtml(chatId)}</code></h3>
        <div class="status-bar">
          ${c.escalated ? '<span class="badge badge-cancelled">Escalated</span>' : ''}
          <span class="badge badge-approved">${c.message_count} pesan</span>
        </div>
      </div>
      ${c.customer_name ? `<p style="color:var(--muted);font-size:14px">Pelanggan: <strong>${escHtml(c.customer_name)}</strong>${c.customer_phone ? ` (${escHtml(c.customer_phone)})` : ''}</p>` : ''}
    </div>

    <div class="card">
      <div class="card-header"><h3>Transcript</h3></div>
      <div id="transcript" style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto;padding:4px"></div>
    </div>
  `

  const transcriptEl = document.querySelector('#transcript')

  if (!c.messages?.length) {
    transcriptEl.innerHTML = '<p style="color:var(--muted)">Belum ada pesan.</p>'
    return
  }

  transcriptEl.innerHTML = c.messages
    .map((m) => {
      const isUser = m.role === 'user'
      const label = isUser ? '👤 Pelanggan' : '🤖 Bot'
      const content = isUser ? escHtml(m.content) : renderMarkdown(m.content)
      return `
        <div class="message ${isUser ? 'user' : 'bot'}">
          <div style="font-size:12px;font-weight:700;margin-bottom:4px;opacity:0.7">${label}</div>
          <div>${content}</div>
        </div>
      `
    })
    .join('')

  transcriptEl.scrollTop = transcriptEl.scrollHeight
}

// ── Bookings ─────────────────────────────────────────────

let bookingFilter = ''

async function loadBookingsPage() {
  titleEl.textContent = '📅 Booking'
  actionsEl.innerHTML = ''

  bodyEl.innerHTML = `
    <div class="filter-bar" id="filters"></div>
    <div class="card desktop-only">
      <table class="data-table" id="bookingTable">
        <thead>
          <tr>
            <th>Plat</th>
            <th>Mobil</th>
            <th>Service</th>
            <th>Pelanggan</th>
            <th>Status</th>
            <th>Tanggal</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody id="bookingBody"></tbody>
      </table>
    </div>
    <div class="mobile-card-list mobile-only" id="bookingCards"></div>
  `

  const filtersEl = document.querySelector('#filters')
  const allStatuses = ['', 'pending', 'approved', 'in_progress', 'done', 'cancelled']
  const statusLabels = {
    '': 'Semua',
    pending: '🟡 Pending',
    approved: '🔵 Approved',
    in_progress: '🟣 In Progress',
    done: '🟢 Done',
    cancelled: '🔴 Cancelled',
  }

  filtersEl.innerHTML = allStatuses
    .map((s) => `<button class="filter-btn ${s === bookingFilter ? 'active' : ''}" data-status="${s}">${statusLabels[s]}</button>`)
    .join('')

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn')
    if (!btn) return
    bookingFilter = btn.dataset.status
    loadBookingsPage()
  })

  const params = bookingFilter ? `?status=${bookingFilter}` : ''
  const data = await api(`/bookings${params}`)
  const tbody = document.querySelector('#bookingBody')
  const cardsEl = document.querySelector('#bookingCards')

  if (!data.bookings?.length) {
    const empty = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:32px">Tidak ada booking</td></tr>`
    if (tbody) tbody.innerHTML = empty
    if (cardsEl) cardsEl.innerHTML = '<p style="text-align:center;color:var(--muted);padding:32px">Tidak ada booking</p>'
    return
  }

  const statusOptions = (current) =>
    ['pending', 'approved', 'in_progress', 'done', 'cancelled']
      .map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`)
      .join('')

  if (tbody) {
    tbody.innerHTML = data.bookings
      .map(
        (b) => `
      <tr>
        <td><strong>${escHtml(b.plate_number || '-')}</strong></td>
        <td>${escHtml(b.car_model || '-')}</td>
        <td>${escHtml(b.service_type)}</td>
        <td>${escHtml(b.customer_name || '-')}</td>
        <td><span class="badge badge-${b.status}">${b.status}</span></td>
        <td>${b.booked_at || '-'}</td>
        <td>
          <select class="status-select" data-id="${b.id}" style="background:var(--input-bg);color:var(--text);border:1px solid var(--card-border);border-radius:6px;padding:4px 8px;font-size:13px">
            ${statusOptions(b.status)}
          </select>
          <button class="btn btn-small btn-primary update-btn" data-id="${b.id}">✓</button>
        </td>
      </tr>
    `,
      )
      .join('')
  }

  if (cardsEl) {
    cardsEl.innerHTML = data.bookings
      .map(
        (b) => `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div class="mobile-card-title">${escHtml(b.plate_number || '-')}</div>
          <span class="badge badge-${b.status}">${b.status}</span>
        </div>
        <div class="mobile-card-meta">${escHtml(b.car_model || '-')} · ${escHtml(b.service_type)}</div>
        <div class="mobile-card-row">
          <span class="mobile-card-label">Pelanggan</span>
          <span>${escHtml(b.customer_name || '-')}</span>
        </div>
        <div class="mobile-card-row">
          <span class="mobile-card-label">Tanggal</span>
          <span>${b.booked_at || '-'}</span>
        </div>
        <div class="mobile-card-actions">
          <select class="status-select" data-id="${b.id}">${statusOptions(b.status)}</select>
          <button class="btn btn-primary update-btn" data-id="${b.id}">✓</button>
        </div>
      </div>
    `,
      )
      .join('')
  }

  document.querySelectorAll('.update-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const select = document.querySelector(`.status-select[data-id="${id}"]`)
      const newStatus = select.value

      const result = await api(`/bookings/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      })

      if (result.ok) {
        toast(`Status diupdate → ${newStatus}`)
        loadBookingsPage()
      } else {
        toast(result.error || 'Gagal update', 'error')
      }
    })
  })
}

// ── Settings ─────────────────────────────────────────────

async function loadSettingsPage() {
  document.body.classList.add('settings-page')
  titleEl.textContent = '⚙️ Settings'
  actionsEl.innerHTML = `<button class="btn btn-primary" id="saveSettingsBtn">💾 Simpan</button>`

  const data = await api('/settings')
  const settings = data.settings || {}

  const fields = [
    { key: 'WORKSHOP_NAME', label: 'Nama Bengkel' },
    { key: 'WORKSHOP_ADDRESS', label: 'Alamat' },
    { key: 'WORKSHOP_PHONE', label: 'Telepon' },
    { key: 'WORKSHOP_HOURS', label: 'Jam Buka' },
    { key: 'WORKSHOP_DAYS', label: 'Hari Buka' },
    { key: 'WORKSHOP_SPECIALIZATION', label: 'Spesialisasi' },
    { key: 'BOT_NAME', label: 'Nama Bot' },
    { key: 'BOT_TAGLINE', label: 'Tagline (tampil di halaman chat)' },
    { key: 'LLM_PROVIDER', label: 'LLM Provider' },
    { key: 'LLM_MODEL', label: 'LLM Model' },
    { key: 'LOG_LEVEL', label: 'Log Level' },
  ]

  bodyEl.innerHTML = `
    <div class="card settings-card" style="max-width:640px">
      <div class="card-header"><h3>Konfigurasi Bengkel</h3></div>
      ${fields
        .map(
          (f) => `
        <div class="form-group">
          <label for="setting-${f.key}">${f.label} <span style="color:var(--muted);font-weight:400;font-size:12px">(${f.key})</span></label>
          <input type="text" id="setting-${f.key}" data-key="${f.key}" value="${escAttr(settings[f.key] || '')}" />
        </div>
      `,
        )
        .join('')}
    </div>
    <div class="settings-save-bar mobile-only">
      <button class="btn btn-primary" id="saveSettingsBtnMobile" type="button">💾 Simpan Settings</button>
    </div>
  `

  async function saveSettings() {
    const updates = {}
    fields.forEach((f) => {
      const input = document.querySelector(`#setting-${f.key}`)
      updates[f.key] = input.value
    })

    const result = await api('/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    if (result.ok) {
      toast('Settings tersimpan ✓')
    } else {
      toast(result.error || 'Gagal menyimpan', 'error')
    }
  }

  document.querySelector('#saveSettingsBtn')?.addEventListener('click', saveSettings)
  document.querySelector('#saveSettingsBtnMobile')?.addEventListener('click', saveSettings)
}

// ── Helpers ──────────────────────────────────────────────

function renderMarkdown(text) {
  try {
    return marked.parse(text, { breaks: true, gfm: true })
  } catch {
    return escHtml(text)
  }
}

function escHtml(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// ── Branding ─────────────────────────────────────────────

async function applyBranding() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    const name = data.workshop?.trim() || data.bot?.trim() || 'BengkelBot'
    const brand = document.querySelector('#sidebar-brand')
    if (brand) brand.textContent = `🔧 ${name}`
    document.title = `Dashboard — ${name} Admin`
  } catch {
    const brand = document.querySelector('#sidebar-brand')
    if (brand) brand.textContent = '🔧 BengkelBot'
  }
}

// ── Init ─────────────────────────────────────────────────

applyBranding()
loadPage(getHash())
