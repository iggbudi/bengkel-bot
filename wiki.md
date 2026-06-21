# 📖 BengkelBot — Wiki Lengkap

> Dokumentasi komprehensif codebase BengkelBot: arsitektur, alur data, API, konfigurasi, dan panduan pengembangan.

---

## Daftar Isi

1. [Ringkasan Proyek](#1-ringkasan-proyek)
   - [Status Produksi (cmaestro.my.id)](#11-status-produksi-cmaestromyid)
2. [Arsitektur Sistem](#2-arsitektur-sistem)
3. [Struktur Direktori](#3-struktur-direktori)
   - [Layout VPS Produksi](#31-layout-vps-produksi)
4. [Alur Data & Request Lifecycle](#4-alur-data--request-lifecycle)
5. [Modul-modul Penting](#5-modul-modul-penting)
6. [Database Schema](#6-database-schema)
7. [Knowledge Base (KB)](#7-knowledge-base-kb)
8. [LLM Provider & Konfigurasi Model](#8-llm-provider--konfigurasi-model)
9. [Tool / Fungsi Workshop](#9-tool--fungsi-workshop)
10. [Channel Komunikasi](#10-channel-komunikasi)
11. [Admin Dashboard](#11-admin-dashboard)
12. [API Reference](#12-api-reference)
13. [Konfigurasi Environment (.env)](#13-konfigurasi-environment-env)
14. [Deployment](#14-deployment)
15. [Troubleshooting](#15-troubleshooting)
16. [Panduan Pengembangan](#16-panduan-pengembangan)

---

## 1. Ringkasan Proyek

**BengkelBot** adalah chatbot AI untuk bengkel mobil di Semarang yang dibangun di atas **pi SDK** (agent runtime). Bot ini berkomunikasi dengan pelanggan melalui **Web UI** (produksi), **TUI terminal** (testing lokal), atau **WhatsApp** (via Baileys, opsional), dan menggunakan LLM (OpenAI atau SumoPod) untuk memahami dan merespons pesan pelanggan.

### Fitur Utama

- **Chat otomatis** — pelanggan bisa tanya harga, booking, cek status service
- **Multi-channel** — Web UI (aktif di produksi), TUI terminal, WhatsApp (opsional, belum diaktifkan)
- **Knowledge Base** — FAQ, daftar harga, slang Jawa/Semarang, panduan diagnosa awal
- **Tool calling** — LLM bisa memanggil tool untuk booking, lookup, escalate
- **Admin Dashboard** — edit KB, kelola booking, lihat sesi chat, ubah settings
- **Streaming response** — balasan bot muncul secara real-time di Web UI

### 1.1 Status Produksi (cmaestro.my.id)

> **Penting untuk agent/AI:** deployment produksi saat ini **hanya Web mode**. WhatsApp **belum** diaktifkan dan **tidak perlu** disetup kecuali diminta eksplisit.

| Aspek | Nilai saat ini |
|-------|----------------|
| Domain | `https://cmaestro.my.id` |
| Mode aktif | Web server (`src/web/server.ts`) |
| WhatsApp | Tidak aktif — jangan jalankan `npm run dev` / `src/index.ts` |
| Reverse proxy | **Sudah aktif** — Apache → `http://127.0.0.1:3012` |
| SSL | Let's Encrypt via Apache (`cmaestro.my.id-le-ssl.conf`) |
| PM2 process | `cmaestro-bengkelbot` |
| PM2 script | `dist/web/server.js` (bukan `dist/index.js`) |
| `WEB_PORT` | `3012` |
| `WEB_HOST` | `127.0.0.1` (hanya localhost; publik lewat Apache) |
| LLM produksi | `sumopod/deepseek-v4-pro` |
| Workshop | CMaestro |
| Chat UI | `https://cmaestro.my.id/` |
| Admin | `https://cmaestro.my.id/admin` |
| Health check | `https://cmaestro.my.id/api/health` |

**Alur request produksi:**

```
Browser → https://cmaestro.my.id
       → Apache (port 443, SSL)
       → ProxyPass / → http://127.0.0.1:3012/
       → BengkelBot web server (PM2)
```

**Catatan:** file `/var/www/cmaestro.my.id/public/index.html` (landing placeholder "Website sedang aktif") **tidak dilayani** ke publik karena Apache mem-proxy semua request ke Node. Static files chat UI dilayani dari `repo/public/`.

---

## 2. Arsitektur Sistem

### Produksi (cmaestro.my.id)

```
Browser (HTTPS)
      │
      ▼
Apache :443  ──ProxyPass──▶  Node web server :3012  (PM2: cmaestro-bengkelbot)
                                    │
                                    ▼
                              BengkelBot Agent → SQLite + LLM (SumoPod)
```

### Umum (semua channel)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Pelanggan                                 │
│         (Web Browser — produksi / TUI / WhatsApp — opsional)     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Channel Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  WhatsApp     │  │  Web Server  │  │  TUI         │          │
│  │  (Baileys)    │  │  (HTTP/SSE)  │  │  (readline)  │          │
│  │  [opsional]   │  │  [produksi]  │  │  [dev/test]  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                   │
│                            │                                     │
│                  IncomingMessage                                  │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BengkelBot (Agent Layer)                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  agent.ts — BengkelBot class                            │    │
│  │                                                         │    │
│  │  1. Resolve LLM model (OpenAI / SumoPod)                │    │
│  │  2. Build system prompt from KB files                   │    │
│  │  3. Load conversation history from DB                   │    │
│  │  4. Create pi SDK AgentSession                          │    │
│  │  5. Inject custom workshop tools                        │    │
│  │  6. Call session.prompt(text)                            │    │
│  │  7. Collect response (streaming or batch)               │    │
│  │  8. Save conversation to DB                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  system-prompt.ts — System Prompt Builder               │    │
│  │  Reads: faq.md, services.md, slang.md, diagnostics.md   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  workshop-pi.ts — Tool Definitions (pi SDK format)       │    │
│  │  workshop.ts — Tool Handlers (business logic)           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SQLite Database                               │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ workshops  │ │ customers  │ │ bookings │ │ conversations │  │
│  └────────────┘ └────────────┘ └──────────┘ └───────────────┘  │
│                   Path: data/bengkelbot.db                       │
└─────────────────────────────────────────────────────────────────┘
```

### Pi SDK Integration

BengkelBot menggunakan **pi SDK** (`@earendil-works/pi-coding-agent`) sebagai agent runtime. Berikut alur integrasinya:

1. **ModelRegistry** — mendaftarkan model LLM (OpenAI/SumoPod) beserta API key
2. **AuthStorage** — menyimpan API key di `data/auth.json`
3. **AgentSession** — sesi percakapan dengan LLM, mendukung tool calling
4. **DefaultResourceLoader** — memuat system prompt (di-override manual)
5. **ToolDefinition** — mendefinisikan tool yang bisa dipanggil LLM (menggunakan `@sinclair/typebox` untuk validasi parameter)
6. **SessionManager.inMemory()** — menyimpan state sesi di memori (dibuat baru setiap request)

---

## 3. Struktur Direktori

### 3.1 Layout VPS Produksi

```
/var/www/cmaestro.my.id/
├── public/                   # Landing placeholder (TIDAK dilayani — Apache proxy ke Node)
│   └── index.html
└── repo/                     # Aplikasi BengkelBot (working directory PM2)
    ├── src/                  # TypeScript source
    ├── dist/                 # Compiled JS — PM2 menjalankan dist/web/server.js
    ├── public/               # Chat UI + admin dashboard (dilayani Node)
    ├── data/                 # SQLite DB + pi SDK auth
    ├── auth/wa-session/      # Sesi WhatsApp (kosong — belum dipakai)
    ├── .env                  # Konfigurasi produksi
    └── wiki.md               # Dokumen ini
```

### 3.2 Layout Repo (development)

```
repo/
├── src/
│   ├── index.ts              # Entry point — mode WhatsApp
│   ├── tui.ts                # Entry point — mode TUI/terminal
│   ├── web/
│   │   └── server.ts         # Web server (HTTP + SSE + Admin API)
│   ├── bot/
│   │   ├── agent.ts          # BengkelBot class (pi SDK wrapper)
│   │   └── system-prompt.ts  # System prompt builder dari KB files
│   ├── channels/
│   │   └── whatsapp.ts       # Baileys WhatsApp adapter
│   ├── config/
│   │   └── llm.ts            # LLM provider resolution
│   ├── db/
│   │   ├── schema.ts         # SQLite schema + repository functions
│   │   └── init.ts           # DB init + seed data
│   ├── providers/
│   │   ├── openai.ts         # OpenAI GPT-5.4 Mini model definition
│   │   └── sumopod.ts        # SumoPod/MiniMax provider + API client
│   ├── tools/
│   │   ├── workshop.ts       # Tool handlers (business logic)
│   │   └── workshop-pi.ts    # Tool definitions (pi SDK format)
│   ├── admin/
│   │   ├── auth.ts           # Admin session & cookie auth
│   │   ├── bookings.ts       # Booking admin API
│   │   ├── conversations.ts  # Conversation admin API
│   │   ├── kb.ts             # Knowledge base read/write
│   │   └── settings.ts       # Settings read/write (.env)
│   └── kb/
│       ├── faq.md            # FAQ bengkel
│       ├── services.md       # Daftar layanan & harga
│       ├── slang.md          # Pemetaan slang Jawa/Semarang
│       └── diagnostics.md    # Panduan diagnosa awal
├── public/
│   ├── index.html            # Web chat UI
│   ├── app.js                # Client-side chat logic (SSE)
│   ├── style.css             # Chat UI dark theme
│   └── admin/
│       ├── login.html        # Admin login page
│       ├── dashboard.html    # Admin SPA shell
│       ├── app.js            # Admin SPA logic
│       └── style.css         # Admin dark theme
├── data/
│   ├── bengkelbot.db         # SQLite database
│   ├── auth.json             # Pi SDK auth state
│   └── models.json           # Pi SDK model registry
├── auth/
│   └── wa-session/           # WhatsApp Baileys session files
├── agent-tools/              # Pi SDK agent tool cache
├── mcps/                     # MCP server configs (external)
├── .env                      # Environment variables (secret)
├── .env.example              # Template .env
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Alur Data & Request Lifecycle

### 4.1 Alur Pesan WhatsApp → Bot → Balasan

```
1. WhatsApp message masuk (Baileys event: messages.upsert)
2. WhatsAppChannel.handleIncomingMessage() mengekstrak:
   - from (JID), pushName (nama), body (teks)
3. MessageHandler dipanggil (dari index.ts)
4. Jika pesan diawali "/" → handleMontirCommand()
5. Jika pesan biasa → BengkelBot.processMessage(chatId, name, text)
6. Di dalam processMessage():
   a. Resolve LLM model dari ModelRegistry
   b. Build system prompt (gabungan identitas + KB files)
   c. Ambil 10 pesan terakhir dari DB sebagai riwayat
   d. Buat AgentSession baru (in-memory)
   e. Inject custom workshop tools (createWorkshopPiTools)
   f. Kirim prompt ke LLM: "[Riwayat] + [Pelanggan]: [pesan]"
   g. LLM merespons (bisa call tool: lookup_booking, create_booking, dll)
   h. Tool handler eksekusi → result dikembalikan ke LLM
   i. LLM finalisasi jawaban
7. Simpan {user_message, bot_reply} ke conversations table
8. Kembalikan reply string ke channel
9. Channel kirim reply ke pelanggan
```

### 4.2 Alur Streaming (Web UI)

```
1. Browser minta token: `GET /api/chat/token?chatId=xxx`
2. Browser buka `/api/chat?chatId=xxx&chatToken=yyy&message=zzz` (GET → SSE)
3. Server set headers: text/event-stream
4. Kirim event: start
5. BengkelBot.processMessageStream() dipanggil
5. Di setiap delta dari LLM → kirim event: delta {delta, text}
6. Saat selesai → kirim event: done {text}
7. Browser update bubble chat secara real-time
```

### 4.3 Alur Tool Calling

```
1. LLM menerima pesan pelanggan
2. LLM memutuskan perlu memanggil tool (misal: lookup_booking)
3. AgentSession meng-emit event: tool_call
4. workshop-pi.ts execute() dipanggil → handleWorkshopTool()
5. Handler eksekusi query DB atau operasi lain
6. Hasil tool dikembalikan ke LLM sebagai tool_result
7. LLM gunakan hasil untuk merespons pelanggan
```

---

## 5. Modul-modul Penting

### 5.1 `src/bot/agent.ts` — BengkelBot Class

| Method | Fungsi |
|--------|--------|
| `constructor(config)` | Inisialisasi ModelRegistry, AuthStorage, LLM config |
| `processMessage(chatId, name, msg)` | Proses pesan, kembalikan jawaban (non-streaming) |
| `processMessageStream(chatId, name, msg, onChunk)` | Proses pesan dengan streaming callback |
| `getLlmDescription()` | Deskripsi model yang digunakan |
| `escalate(chatId, name, msg, channel)` | Escalate ke montir via tool |
| `detectChannel(chatId)` | Deteksi channel dari prefix chatId (web:/telegram:/whatsapp) |
| `registerApiKeys()` | Daftarkan API keys ke AuthStorage |

### 5.2 `src/bot/system-prompt.ts` — System Prompt

System prompt dibangun dari template statis + konten KB files. Struktur:

```
Identitas Bot & Bengkel
→ Personalitas & Gaya Bahasa
→ Aturan Privasi & Keselamatan
→ Workflow (Intent Recognition)
→ Tool Usage Guide
→ Knowledge Base (FAQ, Services, Slang, Diagnostics)
→ Hard Rules
```

### 5.3 `src/config/llm.ts` — LLM Configuration

Fungsi utama:
- `resolveLlmEnv()` — baca env vars → `LlmEnvConfig`
- `toLlmConfig(env)` — konversi ke `LlmConfig` (provider + modelId)
- `resolveModel(registry, config, baseUrl)` — resolve Model object dari registry
- `describeLlm(config)` → string seperti `"openai/gpt-5.4-mini"`

### 5.4 `src/providers/openai.ts` — OpenAI Model Definition

Mendefinisikan model `gpt-5.4-mini` untuk pi SDK:
- API: `openai-responses`
- Context window: 400K tokens
- Max output: 128K tokens
- Supports reasoning, text + image input

### 5.5 `src/providers/sumopod.ts` — SumoPod Provider

Provider class untuk MiniMax 2.7B HighSpeed via SumoPod:
- OpenAI-compatible API (chat/completions)
- Mendukung non-streaming (`chat()`) dan streaming (`streamChat()`)
- Method `api()` mengembalikan `ApiInterface` untuk pi SDK
- Tool calling support
- Zod schema untuk validasi response

---

## 6. Database Schema

Database: **SQLite** via `node:sqlite` (built-in Node.js 22+, tanpa native compilation).
Path: `data/bengkelbot.db`
Mode: WAL (Write-Ahead Logging) + Foreign Keys ON.

### Tabel `workshops`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT PK | ID unik (misal: "default") |
| `name` | TEXT NOT NULL | Nama bengkel |
| `address` | TEXT | Alamat |
| `phone` | TEXT | Telepon |
| `hours` | TEXT | Jam buka |
| `days` | TEXT | Hari operasional |
| `specialization` | TEXT | Spesialisasi |
| `created_at` | DATETIME | Waktu pembuatan |

### Tabel `customers`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT PK | UUID |
| `workshop_id` | TEXT FK | → workshops.id |
| `name` | TEXT | Nama pelanggan |
| `phone` | TEXT UNIQUE | Nomor telepon (normalized: 628xxx) |
| `car_model` | TEXT | Tipe mobil |
| `plate_number` | TEXT | Plat nomor |
| `created_at` | DATETIME | Waktu pembuatan |

### Tabel `bookings`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT PK | UUID |
| `workshop_id` | TEXT FK | → workshops.id |
| `customer_id` | TEXT FK | → customers.id (nullable) |
| `service_type` | TEXT NOT NULL | Jenis service |
| `description` | TEXT | Deskripsi keluhan |
| `plate_number` | TEXT | Plat nomor |
| `car_model` | TEXT | Tipe mobil |
| `estimate_low` | INTEGER | Estimasi harga bawah |
| `estimate_high` | INTEGER | Estimasi harga atas |
| `final_price` | INTEGER | Harga final |
| `status` | TEXT | pending/approved/in_progress/done/cancelled |
| `booked_at` | DATETIME | Jadwal booking |
| `done_at` | DATETIME | Waktu selesai |
| `notes` | TEXT | Catatan |
| `created_at` | DATETIME | Waktu pembuatan |

### Tabel `conversations`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | TEXT PK | UUID |
| `workshop_id` | TEXT FK | → workshops.id |
| `customer_id` | TEXT FK | → customers.id (nullable) |
| `channel` | TEXT | whatsapp/telegram/web |
| `chat_id` | TEXT | ID chat (JID atau web:xxx) |
| `messages` | TEXT | JSON array [{role, content}] |
| `escalated` | BOOLEAN | Apakah sudah di-escalate |
| `last_message_at` | DATETIME | Waktu pesan terakhir |
| `created_at` | DATETIME | Waktu pembuatan |

### Index

- `idx_customers_phone` — customers.phone
- `idx_bookings_plate` — bookings.plate_number
- `idx_bookings_status` — bookings.status
- `idx_conversations_chat` — conversations(chat_id, channel)

### Repository Functions

| Class | Method | Keterangan |
|-------|--------|------------|
| `CustomerRepo` | `upsert(data)` | Insert/update customer by phone |
| `CustomerRepo` | `findByPhone(phone)` | Cari customer by phone |
| `BookingRepo` | `create(data)` | Buat booking baru |
| `BookingRepo` | `findByPlate(plate)` | Cari booking by plat (case-insensitive) |
| `BookingRepo` | `updateStatus(id, status, notes)` | Update status booking |
| `ConversationRepo` | `upsert(data)` | Insert/update conversation by chatId+channel |
| `ConversationRepo` | `getMessages(chatId, channel)` | Ambil array pesan |
| `ConversationRepo` | `listAll(options)` | List semua conversation (with JOIN customers) |
| `ConversationRepo` | `getById(id)` | Detail 1 conversation |
| `ConversationRepo` | `countByChannel()` | Statistik per channel |
| `ConversationRepo` | `countRecent(hours)` | Jumlah conversation X jam terakhir |

---

## 7. Knowledge Base (KB)

KB disimpan sebagai file Markdown di `src/kb/`. Dibaca oleh `system-prompt.ts` dan dimasukkan ke system prompt LLM.

### File KB

| File | Isi | Digunakan Untuk |
|------|-----|-----------------|
| `faq.md` | FAQ bengkel, info jam buka, garansi | Menjawab pertanyaan umum |
| `services.md` | Daftar 18 layanan + harga estimasi + daftar oli | Menjawab pertanyaan harga |
| `slang.md` | Pemetaan slang Jawa/Semarang → bahasa formal | Memahami pesan pelanggan |
| `diagnostics.md` | Gejala → penyebab → service rekomendasi | Membantu diagnosa awal |

### Edit KB via Admin Dashboard

Buka `/admin` → pilih file KB → edit markdown di editor → preview live → simpan.

### Edit KB via Code

Edit langsung file markdown di `src/kb/`. Perubahan berlaku setelah restart bot (system prompt di-build saat request).

---

## 8. LLM Provider & Konfigurasi Model

### Supported Providers

| Provider | Model | Base URL | API Type |
|----------|-------|----------|----------|
| `openai` | `gpt-5.4-mini` | `https://api.openai.com/v1` | OpenAI Responses API |
| `sumopod` | `minimax-2.7-highspeed`, `deepseek-v4-pro`, dll. | `https://ai.sumopod.com/v1` | OpenAI-compatible |

> **Produksi saat ini:** `LLM_PROVIDER=sumopod`, `LLM_MODEL=deepseek-v4-pro`

### Konfigurasi

```env
LLM_PROVIDER=openai          # atau "sumopod"
LLM_MODEL=gpt-5.4-mini       # atau "minimax-2.7-highspeed"
OPENAI_API_KEY=sk-xxx         # required jika provider=openai
SUMOPOD_API_KEY=sp-xxx        # required jika provider=sumopod
```

### Flow Resolution

1. `resolveLlmEnv()` baca env vars
2. `toLlmConfig()` konversi ke `{provider, modelId}`
3. `resolveModel(registry, config, baseUrl)` → Model object pi SDK
4. Jika model custom (gpt-5.4-mini), definisi manual dari `openai.ts`
5. Jika model built-in pi SDK, cari di `registry.find(provider, modelId)`

---

## 9. Tool / Fungsi Workshop

Tool adalah fungsi yang bisa dipanggil LLM saat memproses pesan pelanggan.

### Daftar Tool

| Tool | Parameter | Fungsi |
|------|-----------|--------|
| `lookup_booking` | `plate_number` | Cari booking berdasarkan plat nomor |
| `create_booking` | `customer_id, service_type, description, plate_number, car_model, preferred_date` | Buat booking baru |
| `upsert_customer` | `name, phone, car_model, plate_number` | Daftar/update data pelanggan |
| `update_booking_status` | `booking_id, status, notes` | Update status booking |
| `get_service_catalog` | *(none)* | Ambil daftar layanan & harga |
| `escalate_to_montir` | `customer_name, plate_number, summary, channel` | Teruskan ke tim montir |
| `send_whatsapp_message` | `phone_number, message` | Kirim pesan WhatsApp |

### Dua Layer Tool

1. **`workshop.ts`** — `handleWorkshopTool(call)`: handler murni, menerima `{name, args}`, mengembalikan JSON string. Digunakan oleh tool handler dan montir commands.
2. **`workshop-pi.ts`** — `createWorkshopPiTools()`: membungkus handler ke format `ToolDefinition` pi SDK (menggunakan `@sinclair/typebox` untuk validasi parameter). Digunakan saat membuat `AgentSession`.

### Flow Tool Calling

```
LLM decide → call tool "lookup_booking" with {plate_number: "B 1234 CD"}
    ↓
AgentSession.emit tool_call event
    ↓
workshop-pi.ts execute() called
    ↓
handleWorkshopTool({name: "lookup_booking", args: {plate_number: "B 1234 CD"}})
    ↓
BookingRepo.findByPlate("B 1234 CD") → query SQLite
    ↓
return JSON: {found: true, booking: {...}}
    ↓
Result sent back to LLM as tool_result
    ↓
LLM uses result to compose final answer to customer
```

---

## 10. Channel Komunikasi

### 10.1 WhatsApp (`src/channels/whatsapp.ts`) — Opsional, belum aktif di produksi

> **Status produksi:** channel WhatsApp **belum diaktifkan** di `cmaestro.my.id`. Kode tersedia untuk penggunaan di masa depan; jangan diasumsikan sudah berjalan.

- Library: **Baileys v6** (`baileys`)
- Auth: QR code scan pertama kali → session disimpan di `auth/wa-session/`
- Auto-reconnect on disconnect (kecuali logged out)
- Mendukung: teks, gambar (caption), video (caption)
- Group messages: diabaikan (future: mention detection)
- Format JID: `6281234567890@s.whatsapp.net`

### 10.2 Web UI (`src/web/server.ts`) — Channel aktif di produksi

- HTTP server native (tanpa framework)
- Port: `WEB_PORT` (default 3000; **produksi: 3012**), Host: `WEB_HOST` (default 127.0.0.1)
- Publik via Apache reverse proxy: `https://cmaestro.my.id`
- Endpoints:
  - `GET /api/health` — health check
  - `GET /api/chat/token?chatId=...` — Dapatkan HMAC chat token
  - `GET /api/chat/history?chatId=...&chatToken=...` — Riwayat chat (butuh token)
  - `GET /api/chat?message=...&chatId=...&chatToken=...` — SSE streaming chat
  - `POST /api/chat` — JSON fallback chat (butuh chatToken)
- Static files dari `public/`
- Chat UI: dark theme, markdown rendering, localStorage history

### 10.3 TUI / Terminal (`src/tui.ts`)

- readline-based interactive chat
- Cocok untuk testing lokal
- Command: `/help`, `/exit`

---

## 11. Admin Dashboard

Akses:
- **Produksi:** `https://cmaestro.my.id/admin`
- **Lokal:** `http://localhost:3000/admin` (atau port `WEB_PORT` yang dikonfigurasi)

### Login

Atur credential via `.env`:

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_secure_password
```

### Fitur

| Halaman | Fungsi |
|---------|--------|
| **KB Editor** | Edit 4 file KB (FAQ, Layanan, Slang, Diagnosa) via markdown editor + live preview |
| **Sesi Chat** | List semua percakapan, filter by channel, lihat detail/transcript |
| **Booking** | List booking, filter by status, update status inline |
| **Settings** | Edit konfigurasi bengkel + LLM (langsung update .env) |

### Auth System

- Cookie-based session (`bengkelbot.sid`)
- In-memory session store (Map)
- TTL: 24 jam
- Auto-redirect ke `/admin/login` jika belum login

### Admin API Routes

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/admin/api/login` | Login (username + password) |
| GET | `/admin/api/logout` | Logout |
| GET | `/admin/api/kb` | List KB files |
| GET | `/admin/api/kb/:name` | Baca 1 KB file |
| PUT | `/admin/api/kb/:name` | Tulis/update KB file |
| GET | `/admin/api/bookings` | List booking (filter: ?status=) |
| PUT | `/admin/api/bookings/:id` | Update status booking |
| GET | `/admin/api/conversations` | List conversations (filter: ?channel=) |
| GET | `/admin/api/conversations/:id` | Detail conversation |
| GET | `/admin/api/conversations/stats` | Statistik sesi |
| GET | `/admin/api/settings` | Baca settings |
| PUT | `/admin/api/settings` | Tulis settings ke .env |

---

## 12. API Reference

### Public API

#### `GET /api/health`

```json
{
  "ok": true,
  "configError": null,
  "bot": "BengkelBot",
  "workshop": "CMaestro",
  "tagline": "Asisten pintar bengkel mobil Anda — booking, estimasi biaya & konsultasi",
  "llm": "sumopod/deepseek-v4-pro"
}
```

#### `GET /api/chat/token?chatId=...`

```json
{ "chatId": "uuid", "chatToken": "base64url-hmac" }
```

#### `GET /api/chat/history?chatId=...&chatToken=...`

Memerlukan `chatToken` valid. Return 401 jika token salah.

#### `GET /api/chat?message=...&chatId=...&chatToken=...&customerName=...` (SSE)

Memerlukan `chatToken` valid. Rate limited per IP.

Events:
- `event: start` → `{"ok": true}`
- `event: delta` → `{"delta": "selamat", "text": "selamat datang di"}`
- `event: done` → `{"text": "Selamat datang di BengkelBot!"}`
- `event: error` → `{"error": "message"}`

#### `POST /api/chat` (JSON fallback)

```json
// Request
{ "message": "Service completo berapa?", "chatId": "xxx", "chatToken": "yyy", "customerName": "Budi" }

// Response
{ "reply": "Service completo di bengkel kami..." }
```

### Montir Commands (WhatsApp)

| Command | Format | Contoh |
|---------|--------|--------|
| `/help` | `/help` | Tampilkan daftar commands |
| `/status` | `/status <plat> <status> [catatan]` | `/status B1234CD done sudah diambil` |
| `/catalog` | `/catalog` | Tampilkan daftar layanan |

Status valid: `pending`, `approved`, `in_progress`, `done`, `cancelled`

---

## 13. Konfigurasi Environment (.env)

### LLM

| Variable | Default | Keterangan |
|----------|---------|------------|
| `LLM_PROVIDER` | `openai` | `openai` atau `sumopod` |
| `LLM_MODEL` | `gpt-5.4-mini` / `minimax-2.7-highspeed` | Model ID |
| `OPENAI_API_KEY` | — | API key OpenAI (required jika provider=openai) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Base URL OpenAI |
| `SUMOPOD_API_KEY` | — | API key SumoPod (required jika provider=sumopod) |
| `SUMOPOD_BASE_URL` | `https://ai.sumopod.com/v1` | Base URL SumoPod (produksi memakai URL ini) |

### Workshop Info

| Variable | Default | Keterangan |
|----------|---------|------------|
| `WORKSHOP_NAME` | Bengkel Demo Semarang | Nama bengkel |
| `WORKSHOP_ADDRESS` | Semarang, Jawa Tengah | Alamat |
| `WORKSHOP_PHONE` | - | Telepon |
| `WORKSHOP_HOURS` | 08.00-17.00 | Jam buka |
| `WORKSHOP_DAYS` | Senin-Sabtu | Hari operasional |
| `WORKSHOP_SPECIALIZATION` | Mobil umum | Spesialisasi |

### Bot

| Variable | Default | Keterangan |
|----------|---------|------------|
| `BOT_NAME` | BengkelBot | Nama bot dalam chat |
| `BOT_TAGLINE` | Asisten pintar bengkel mobil Anda | Subjudul di chat UI |
| `BOT_LANGUAGE` | id | Bahasa |
| `NODE_ENV` | — | `production` di VPS |

### Web Server

| Variable | Default | Keterangan |
|----------|---------|------------|
| `WEB_PORT` | 3000 | Port web server (**produksi: 3012**) |
| `WEB_HOST` | 127.0.0.1 | Bind address — tetap `127.0.0.1` di produksi (Apache yang expose ke publik) |

### Admin

| Variable | Default | Keterangan |
|----------|---------|------------|
| `ADMIN_USERNAME` | — | Username admin dashboard (wajib diset) |
| `ADMIN_PASSWORD` | — | Password admin dashboard (wajib diset, gunakan password kuat) |
| `CHAT_SECRET` | — | Secret HMAC untuk chat token (wajib di production) |
| `RATE_LIMIT_CHAT_PER_MIN` | 20 | Max request chat per IP per menit |
| `RATE_LIMIT_TOKEN_PER_MIN` | 30 | Max request token per IP per menit |

---

## 14. Deployment

### Syarat

- **Node.js 22.5+** (wajib — `node:sqlite` built-in)
- npm
- **Apache** dengan `mod_proxy`, `mod_proxy_http`, `mod_ssl` (produksi `cmaestro.my.id`)

### Quick Start (lokal)

```bash
cd repo
npm install
cp .env.example .env   # edit isi API keys
npm run db:init         # inisialisasi DB + seed data
npm run web             # Web UI — mode yang dipakai di produksi
# npm run tui          # testing terminal
# npm run dev          # WhatsApp — BELUM dipakai di produksi
```

### Production — cmaestro.my.id (konfigurasi saat ini)

**1. Build & jalankan web server via PM2**

```bash
cd /var/www/cmaestro.my.id/repo
npm install
npm run build:all
pm2 start ecosystem.config.cjs
pm2 save
```

> **Jangan** pakai `pm2 start npm -- start` — script `start` menjalankan `dist/index.js` (mode WhatsApp), bukan web server.  
> `ecosystem.config.cjs` mengatur `max_restarts`, log terpisah (`logs/`), dan suppress SQLite experimental warning.

**2. Environment (`.env`)**

```env
WEB_PORT=3012
WEB_HOST=127.0.0.1
NODE_ENV=production
LLM_PROVIDER=sumopod
LLM_MODEL=deepseek-v4-pro
# ... lihat .env.example untuk variabel lainnya
```

**3. Apache reverse proxy** (`/etc/apache2/sites-available/cmaestro.my.id-le-ssl.conf`)

```apache
<VirtualHost *:443>
    ServerName cmaestro.my.id
    ServerAlias www.cmaestro.my.id

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:3012/
    ProxyPassReverse / http://127.0.0.1:3012/

    # SSL via Let's Encrypt
    SSLCertificateFile /etc/letsencrypt/live/cmaestro.my.id/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/cmaestro.my.id/privkey.pem
</VirtualHost>
```

Port 80 (`cmaestro.my.id.conf`) melakukan redirect permanen ke HTTPS.

**4. Verifikasi**

```bash
curl -s http://127.0.0.1:3012/api/health    # Node langsung
curl -sk https://cmaestro.my.id/api/health  # lewat Apache + SSL
pm2 status cmaestro-bengkelbot
```

**5. Deploy ulang setelah perubahan kode**

```bash
cd /var/www/cmaestro.my.id/repo
npm run deploy
```

### WhatsApp Session (opsional — belum diaktifkan)

- Entry point: `npm run dev` → `src/index.ts`
- Session disimpan di `auth/wa-session/`
- **Backup folder ini** jika WhatsApp diaktifkan — kehilangan = harus scan QR ulang
- Baileys bisa disconnect setelah idle lama → gunakan PM2 untuk auto-restart

### Monitoring

- Health check publik: `GET https://cmaestro.my.id/api/health`
- Health check lokal: `GET http://127.0.0.1:3012/api/health`
- PM2: `pm2 status`, `pm2 logs cmaestro-bengkelbot`
- Apache: `/var/log/apache2/cmaestro.my.id_error.log`

---

## 15. Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Domain menampilkan "Website sedang aktif" | Apache proxy belum aktif atau Node tidak jalan — cek `ProxyPass` di Apache dan `pm2 status cmaestro-bengkelbot` |
| `502 Bad Gateway` di domain | Node tidak listen di port yang benar — cek `WEB_PORT` di `.env` cocok dengan `ProxyPass` (harus `3012`) |
| `Missing required env var: OPENAI_API_KEY` | Set `OPENAI_API_KEY` di `.env`, atau ganti `LLM_PROVIDER=sumopod` |
| `Model tidak ditemukan` | Cek `LLM_PROVIDER` dan `LLM_MODEL` di `.env` |
| Bot tidak merespons | Cek API key valid, `pm2 logs cmaestro-bengkelbot` |
| Web UI kosong | Buka console browser (F12) → cek error; pastikan `/api/health` mengembalikan `ok: true` |
| DB locked error | Pastikan tidak ada 2 proses BengkelBot berjalan bersamaan |
| Admin login gagal | Cek `ADMIN_USERNAME` dan `ADMIN_PASSWORD` di `.env` |
| Perubahan kode tidak terlihat | Jalankan `npm run deploy` (build:all + pm2 reload) |
| WhatsApp QR tidak muncul | Hanya relevan jika WhatsApp diaktifkan — jalankan `npm run dev`, cek koneksi internet |
| WhatsApp disconnect terus | Session corrupt — hapus `auth/wa-session/` lalu scan ulang |

---

## 16. Panduan Pengembangan

### Menambah Tool Baru

1. **Definisikan tool** di `src/tools/workshop.ts`:
   - Tambah di array `workshopToolDefs` (OpenAI tool-call format)
   - Tambah handler di `handleWorkshopTool()` switch

2. **Bungkus ke pi SDK format** di `src/tools/workshop-pi.ts`:
   - Tambah `ToolDefinition` baru di `createWorkshopPiTools()`

3. **Jelaskan di system prompt** di `src/bot/system-prompt.ts`:
   - Tambah deskripsi kapan tool harus dipanggil

### Menambah KB File

1. Buat file markdown baru di `src/kb/nama-file.md`
2. Register di `src/admin/kb.ts` → `KB_FILES`
3. Baca di `src/bot/system-prompt.ts` → `buildSystemPrompt()`
4. Tambah entry di admin dashboard navigation

### Menambah Provider LLM

1. Buat file baru di `src/providers/nama-provider.ts`
2. Definisikan Model object sesuai pi SDK type
3. Register di `src/config/llm.ts` → `resolveModel()`
4. Tambah env vars di `.env.example`

### Menambah Channel

1. Buat adapter baru di `src/channels/`
2. Implement interface `IncomingMessage` dan `MessageHandler`
3. Tambah entry point baru (misal: `src/telegram.ts`)
4. Register channel detection di `BengkelBot.detectChannel()`

### Test Locally

```bash
npm run tui           # terminal chat
npm run web           # buka http://localhost:3000 (atau WEB_PORT di .env)
# npm run dev         # WhatsApp — belum dipakai di produksi
```

### Catatan untuk AI Agent

Saat bekerja di deployment `cmaestro.my.id`:

1. **Mode aktif = Web only** — jangan setup WhatsApp kecuali diminta.
2. **Reverse proxy sudah ada** — Apache mem-proxy ke `127.0.0.1:3012`; jangan asumsikan perlu setup Nginx/proxy baru.
3. **PM2 process** bernama `cmaestro-bengkelbot`, menjalankan `dist/web/server.js`.
4. **Static files** chat UI ada di `repo/public/`, bukan `/var/www/cmaestro.my.id/public/`.
5. **Setelah edit TypeScript/React**, wajib `npm run deploy` (`build:all` + `pm2 startOrReload ecosystem.config.cjs`).

---

*Dokumen ini mencerminkan deployment produksi BengkelBot di cmaestro.my.id. Terakhir diperbarui: Juni 2026.*
