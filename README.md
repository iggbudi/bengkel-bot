# BengkelBot 🤖

> AI chatbot for car workshops (bengkel mobil) in Semarang.  
> Powered by **pi SDK** + configurable LLM (**OpenAI** by default, optional **MiniMax 2.7B HighSpeed** via SumoPod) + **Baileys WhatsApp**.

---

## Architecture

```
Pelanggan (WhatsApp)
        │
        ▼
   Baileys v6                    ┌─────────────────────────────┐
   (QR scan / session)           │  BengkelBot Agent             │
        │                        │  ┌─────────────────────────┐  │
        ▼                        │  │  pi SDK AgentSession    │  │
  ┌──────────────────┐           │  │  ModelRegistry          │  │
  │ Incoming Message  │           │  │  OpenAI / SumoPod       │  │
  │ Normalize JID     │───────────▶│  │  configurable LLM       │  │
  └──────────────────┘           │  └──────────┬──────────────┘  │
                                  │             │                 │
                                  │  ┌──────────▼──────────────┐ │
                                  │  │  Workshop Tools         │ │
                                  │  │  create_booking         │ │
                                  │  │  lookup_booking         │ │
                                  │  │  upsert_customer        │ │
                                  │  │  get_service_catalog    │ │
                                  │  │  escalate_to_montir     │ │
                                  │  └──────────┬──────────────┘  │
                                  │             │                 │
                                  └─────────────┼─────────────────┘
                                                │
                                  ┌─────────────▼───────────────┐
                                  │  SQLite (node:sqlite)      │
                                  │  workshops, bookings,      │
                                  │  customers, conversations   │
                                  └─────────────────────────────┘
```

---

## Quick Start

### 1. Install

```bash
cd bengkelbot
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required in `.env` for the default OpenAI provider:
```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.4-mini
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
```

Or use SumoPod/MiniMax:
```env
LLM_PROVIDER=sumopod
LLM_MODEL=minimax-2.7-highspeed
SUMOPOD_API_KEY=your_sumopod_api_key_here
SUMOPOD_BASE_URL=https://open.sumopod.com/v1
```

Optional:
```env
WORKSHOP_NAME=Bengkel Budi Motor
WORKSHOP_ADDRESS=Jl. Tembalang No.1, Semarang
WORKSHOP_PHONE=081234567890
WORKSHOP_HOURS=08.00-17.00
WORKSHOP_DAYS=Senin-Sabtu
WORKSHOP_SPECIALIZATION=Mobil umum
BOT_NAME=BengkelBot
```

### 3. Init Database

```bash
npm run db:init
```

### 4. Run

Terminal/TUI test mode:

```bash
npm run tui
```

Web mode (browser):

```bash
npm run web
```

Lalu buka <http://localhost:3000> di browser.

WhatsApp mode:

```bash
npm run dev
```

You'll see a QR code in the terminal. Scan it with WhatsApp → Linked Devices → **you're live**.

---

## Key Files

| File | Purpose |
|---|---|
| `src/providers/sumopod.ts` | SumoPod/MiniMax custom provider for pi SDK |
| `src/bot/agent.ts` | pi SDK AgentSession wrapper |
| `src/bot/system-prompt.ts` | Builds full system prompt from KB files |
| `src/tools/workshop.ts` | Workshop tools (booking, lookup, escalate) |
| `src/channels/whatsapp.ts` | Baileys WhatsApp adapter |
| `src/db/schema.ts` | SQLite schema + repository functions |
| `src/kb/*.md` | Knowledge base files |

---

## Channels

### TUI / Terminal

Use this first for local testing without connecting WhatsApp:

```bash
npm run tui
```

Type customer messages directly. Exit with `/exit`.

### Web (Browser)

```bash
npm run web
```

Lalu buka <http://localhost:3000>. Fitur:

- Chat UI responsif (dark theme)
- History tersimpan di localStorage
- Clear chat button
- Health check otomatis
- Konfigurasi via `WEB_PORT` (default 3000) dan `WEB_HOST` (default 127.0.0.1)

### WhatsApp

Run:

```bash
npm run dev
```

Scan the QR code with WhatsApp → Linked Devices. Session is stored in `auth/wa-session/`.

### Telegram

Not implemented yet. Planned channel: Telegram Bot API using `TELEGRAM_BOT_TOKEN`.

---

## Admin Dashboard

Buka <http://localhost:3000/admin> (saat web server berjalan).

Default login:

```txt
Username: admin
Password: Unisbank1920
```

Fitur:

- **Knowledge Base editor** — edit FAQ, layanan, slang, diagnosa langsung dari browser (markdown editor + preview)
- **Booking management** — lihat semua booking, filter by status, update status inline
- **Settings** — edit konfigurasi bengkel (nama, alamat, jam buka, LLM provider, dll)
- **Auth** — session cookie, auto-redirect ke login kalau belum masuk

Ubah credential admin via env:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Unisbank1920
```

---

## Montir Commands

| Command | Action |
|---|---|
| `/help` | Show command list |
| `/status <plat> <status> [catatan]` | Update booking status (`pending`, `approved`, `in_progress`, `done`, `cancelled`) |
| `/catalog` | View service catalog |
| `/takeover <plat>` | Take over conversation with customer (planned) |

---

## Customization

### Add a new service
Edit `src/kb/services.md`

### Update FAQ
Edit `src/kb/faq.md`

### Add Javanese slang
Edit `src/kb/slang.md`

### Add new tool
1. Add definition in `src/tools/workshop.ts` → `workshopToolDefs`
2. Add handler in `handleWorkshopTool()`
3. Describe it in the system prompt in `src/kb/diagnostics.md`

---

## Deployment

### VPS (Recommended for MVP)

```bash
# Ubuntu 22.04
# Use Node.js 22.5+ (recommended: current LTS/newer)
apt install nodejs npm
git clone <repo>
cd bengkelbot
npm install --production
npm run db:init
pm2 start npm --name bengkelbot -- start
pm2 save
pm2 startup
```

### WhatsApp Session Persistence
Sessions are saved in `auth/wa-session/`. 
**Backup this folder** — losing it means re-scanning the QR.

### Keep-alive
Baileys may disconnect after long idle. Use PM2 or a cron job to restart if `isReady === false`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent runtime | `@earendil-works/pi-coding-agent` |
| LLM | OpenAI by default, optional MiniMax 2.7B HighSpeed (SumoPod) |
| WhatsApp | Baileys v6 |
| Database | SQLite via `node:sqlite` |
| Language | TypeScript |
| Runtime | Node.js 22.5+ |
| Process manager | PM2 |

---

*PRD: `PRD_BengkelChatbot_Semarang.md`*
