# BengkelBot 🤖

> AI chatbot for car workshops (bengkel mobil) in Semarang.  
> Powered by **pi SDK** + configurable LLM (**OpenAI** or **SumoPod**) + optional **Baileys WhatsApp**.

**Produksi:** [cmaestro.my.id](https://cmaestro.my.id) — Web mode aktif via Apache reverse proxy.  
**Dokumentasi lengkap:** [`wiki.md`](wiki.md)

---

## Status Produksi (cmaestro.my.id)

| Aspek | Nilai |
|-------|-------|
| Mode aktif | Web server (`npm run web` → `dist/web/server.js`) |
| WhatsApp | Belum diaktifkan (opsional) |
| Reverse proxy | Apache → `http://127.0.0.1:3012` |
| PM2 | `cmaestro-bengkelbot` |
| LLM | `sumopod/deepseek-v4-pro` |
| Chat UI | https://cmaestro.my.id/ |
| Admin | https://cmaestro.my.id/admin |

```
Browser → Apache :443 (SSL) → Node :3012 (PM2) → BengkelBot Agent → SQLite + LLM
```

---

## Architecture

```
Pelanggan (Web Browser — produksi / TUI / WhatsApp — opsional)
        │
        ▼
┌──────────────────┐     ┌─────────────────────────────┐
│  Web Server      │     │  BengkelBot Agent             │
│  (HTTP/SSE)      │────▶│  ┌─────────────────────────┐  │
│  [produksi]      │     │  │  pi SDK AgentSession    │  │
└──────────────────┘     │  │  OpenAI / SumoPod LLM   │  │
                         │  └──────────┬──────────────┘  │
┌──────────────────┐     │             │                 │
│  WhatsApp        │     │  ┌──────────▼──────────────┐ │
│  (Baileys)       │────▶│  │  Workshop Tools         │ │
│  [opsional]      │     │  │  booking, lookup, etc.  │ │
└──────────────────┘     │  └──────────┬──────────────┘  │
                         └─────────────┼─────────────────┘
                                       │
                         ┌─────────────▼───────────────┐
                         │  SQLite (node:sqlite)      │
                         │  data/bengkelbot.db        │
                         └─────────────────────────────┘
```

---

## Quick Start (lokal)

### 1. Install

```bash
cd repo
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your credentials
```

OpenAI (default):

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.4-mini
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
```

SumoPod (dipakai di produksi):

```env
LLM_PROVIDER=sumopod
LLM_MODEL=deepseek-v4-pro
SUMOPOD_API_KEY=your_sumopod_api_key_here
SUMOPOD_BASE_URL=https://ai.sumopod.com/v1
```

Workshop & web server:

```env
WORKSHOP_NAME=CMaestro
WORKSHOP_ADDRESS=Jl. Raya Tembalang No.1, Semarang
WORKSHOP_PHONE=081234567890
WORKSHOP_HOURS=08.00-17.00
WORKSHOP_DAYS=Senin-Sabtu
WORKSHOP_SPECIALIZATION=Mobil umum
BOT_NAME=BengkelBot
BOT_TAGLINE=Asisten pintar bengkel mobil Anda
WEB_PORT=3000
WEB_HOST=127.0.0.1
```

### 3. Init Database

```bash
npm run db:init
```

### 4. Run

Web mode (sama dengan produksi):

```bash
npm run web
```

Buka http://localhost:3000

TUI / terminal (testing):

```bash
npm run tui
```

WhatsApp (opsional — belum dipakai di produksi):

```bash
npm run dev
```

Scan QR di terminal → WhatsApp → Linked Devices. Session disimpan di `auth/wa-session/`.

---

## Key Files

| File | Purpose |
|---|---|
| `src/web/server.ts` | Web server + Admin API (entry point produksi) |
| `src/bot/agent.ts` | pi SDK AgentSession wrapper |
| `src/bot/system-prompt.ts` | Builds full system prompt from KB files |
| `src/tools/workshop.ts` | Workshop tools (booking, lookup, escalate) |
| `src/providers/sumopod.ts` | SumoPod custom provider for pi SDK |
| `src/providers/openai.ts` | OpenAI model definition |
| `src/channels/whatsapp.ts` | Baileys WhatsApp adapter (opsional) |
| `src/db/schema.ts` | SQLite schema + repository functions |
| `src/kb/*.md` | Knowledge base files |
| `public/` | Chat UI + admin dashboard static files |
| `wiki.md` | Dokumentasi lengkap (arsitektur, API, deployment) |

---

## Channels

### Web (Browser) — aktif di produksi

```bash
npm run web
```

- Lokal: http://localhost:3000 (atau `WEB_PORT` di `.env`)
- Produksi: https://cmaestro.my.id
- Chat UI dark theme, SSE streaming, history di localStorage
- Health check: `GET /api/health`

### TUI / Terminal

```bash
npm run tui
```

Cocok untuk testing lokal tanpa browser. Exit dengan `/exit`.

### WhatsApp — opsional, belum aktif di produksi

```bash
npm run dev
```

Session disimpan di `auth/wa-session/`. Lihat [`wiki.md`](wiki.md) jika ingin mengaktifkan.

### Telegram

Belum diimplementasi.

---

## Admin Dashboard

- **Produksi:** https://cmaestro.my.id/admin
- **Lokal:** http://localhost:3000/admin

Fitur: KB editor, booking management, sesi chat, settings (update `.env`).

Atur credential via `.env`:

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_secure_password
```

---

## Montir Commands (WhatsApp only)

Hanya berlaku saat mode WhatsApp (`npm run dev`) aktif:

| Command | Action |
|---|---|
| `/help` | Show command list |
| `/status <plat> <status> [catatan]` | Update booking status |
| `/catalog` | View service catalog |
| `/takeover <plat>` | Take over conversation (planned) |

Status valid: `pending`, `approved`, `in_progress`, `done`, `cancelled`

---

## Customization

| Perubahan | File |
|---|---|
| Tambah layanan | `src/kb/services.md` |
| Update FAQ | `src/kb/faq.md` |
| Tambah slang Jawa | `src/kb/slang.md` |
| Tambah tool | `src/tools/workshop.ts` + `src/tools/workshop-pi.ts` |

Atau edit langsung via Admin Dashboard → Knowledge Base.

---

## Deployment (cmaestro.my.id)

### Build & PM2

```bash
cd /var/www/cmaestro.my.id/repo
npm install
npm run build
pm2 start dist/web/server.js --name cmaestro-bengkelbot
pm2 save
```

> **Jangan** pakai `pm2 start npm -- start` — itu menjalankan mode WhatsApp (`dist/index.js`), bukan web server.

### Environment produksi

```env
WEB_PORT=3012
WEB_HOST=127.0.0.1
NODE_ENV=production
LLM_PROVIDER=sumopod
LLM_MODEL=deepseek-v4-pro
```

### Apache reverse proxy

File: `/etc/apache2/sites-available/cmaestro.my.id-le-ssl.conf`

```apache
ProxyPreserveHost On
RequestHeader set X-Forwarded-Proto "https"
ProxyPass / http://127.0.0.1:3012/
ProxyPassReverse / http://127.0.0.1:3012/
```

### Deploy ulang setelah perubahan kode

```bash
npm run build
pm2 restart cmaestro-bengkelbot
```

### Verifikasi

```bash
curl -s http://127.0.0.1:3012/api/health
curl -sk https://cmaestro.my.id/api/health
pm2 status cmaestro-bengkelbot
```

Detail lengkap, troubleshooting, dan API reference: [`wiki.md`](wiki.md)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent runtime | `@earendil-works/pi-coding-agent` |
| LLM | OpenAI atau SumoPod (produksi: `deepseek-v4-pro`) |
| Web | Node.js HTTP server + SSE |
| WhatsApp | Baileys v6 (opsional) |
| Database | SQLite via `node:sqlite` |
| Reverse proxy | Apache + Let's Encrypt |
| Language | TypeScript |
| Runtime | Node.js 22.5+ |
| Process manager | PM2 |

---

*PRD: `PRD_BengkelChatbot_Semarang.md` · Wiki: [`wiki.md`](wiki.md)*