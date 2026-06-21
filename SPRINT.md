# Sprint Perbaikan BengkelBot — Skala Prioritas

> Rencana perbaikan bertahap untuk codebase BengkelBot (cmaestro.my.id).  
> Terakhir diperbarui: Juni 2026

---

## Legenda

| Label | Arti |
|-------|------|
| **P0** | Kritis — risiko keamanan/operasional, segera |
| **P1** | Penting — stabilitas & maintainability |
| **P2** | Perbaikan — kualitas kode & DX |
| **P3** | Nice-to-have — optimasi jangka panjang |

**Estimasi:** S = 0.5–1 hari, M = 1–3 hari, L = 3–5 hari

---

## Sprint 1 — Security Hardening (P0) ✅

**Durasi:** 3–5 hari  
**Tujuan:** Tutup celah keamanan yang paling berdampak di produksi  
**Status:** Selesai

| # | Task | File/Area | Effort | Status |
|---|------|-----------|--------|--------|
| 1.1 | Rotasi password admin produksi | `.env` VPS | S | ✅ |
| 1.2 | Hapus kredensial default dari `wiki.md` | `wiki.md` | S | ✅ |
| 1.3 | Rate limiting `/api/chat` | `src/web/rate-limit.ts`, `server.ts` | M | ✅ |
| 1.4 | Proteksi `/api/chat/history` | `src/web/chat-auth.ts`, `server.ts` | M | ✅ |
| 1.5 | Validasi input chat API | `src/web/chat-validation.ts`, `server.ts` | S | ✅ |
| 1.6 | Audit env vars sensitif | `src/admin/auth.ts`, `server.ts` | S | ✅ |

**Definition of Done:**
- [x] Tidak ada kredensial default di dokumentasi
- [x] Abuse chat API dibatasi (rate limit per IP)
- [x] Riwayat chat memerlukan HMAC token (`CHAT_SECRET`)
- [x] Password admin produksi dirotasi
- [x] Warning jika password admin masih default di production

---

## Sprint 2 — Stabilitas & Bug Fix (P1) ✅

**Durasi:** 4–6 hari  
**Tujuan:** Perbaiki bug perilaku dan kurangi risiko crash/restart  
**Status:** Selesai

| # | Task | File/Area | Effort | Status |
|---|------|-----------|--------|--------|
| 2.1 | Fix escalate channel detection | `src/bot/agent.ts` | S | ✅ |
| 2.2 | Refactor `processMessage` + `processMessageStream` | `src/bot/agent.ts` | M | ✅ |
| 2.3 | Graceful error handling LLM timeout | `src/bot/llm-timeout.ts`, `server.ts` | M | ✅ |
| 2.4 | PM2 monitoring & alert | `ecosystem.config.cjs` | S | ✅ |
| 2.5 | Wrap `node:sqlite` experimental warning | `src/db/schema.ts`, PM2 `node_args` | S | ✅ |
| 2.6 | Fix `build:all` di deploy script | `package.json`, `README.md` | S | ✅ |

**Definition of Done:**
- [x] Escalate memakai channel yang benar (`web`/`whatsapp`/`telegram`)
- [x] Agent logic terpusat di `processMessageCore`
- [x] LLM timeout 60s (configurable via `LLM_TIMEOUT_MS`)
- [x] PM2 ecosystem dengan `max_restarts: 10`, log terpisah
- [x] `npm run deploy` = `build:all` + `pm2 startOrReload`

---

## Sprint 3 — Testing & Data Integrity (P1)

**Durasi:** 5–7 hari  
**Tujuan:** Confidence untuk deploy tanpa regresi

| # | Task | File/Area | Effort | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 3.1 | Setup test runner (Vitest) | `package.json`, config | S | `npm test` jalan di CI/lokal |
| 3.2 | Unit test workshop tools | `src/tools/workshop.ts` | M | Coverage: lookup, create booking, upsert customer, escalate |
| 3.3 | Unit test repository | `src/db/schema.ts` | M | CRUD bookings, conversations, customers |
| 3.4 | Integration test chat API | `src/web/server.ts` | M | Health, SSE flow mock LLM, rate limit |
| 3.5 | Link customer ke conversation | `src/bot/agent.ts`, `schema.ts` | M | Saat `upsert_customer` dipanggil tool, `customer_id` tersimpan di conversation |
| 3.6 | Seed data audit | `src/db/init.ts` | S | Workshop CMaestro konsisten dengan `.env` produksi |

---

## Sprint 4 — Admin & Session (P2)

**Durasi:** 4–5 hari  
**Tujuan:** Admin dashboard lebih andal di produksi

| # | Task | File/Area | Effort | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 4.1 | Persist admin session ke SQLite/file | `src/admin/auth.ts` | M | Login survive PM2 restart |
| 4.2 | Hash password admin (bcrypt) | `src/admin/auth.ts` | M | Password tidak plain-text compare |
| 4.3 | CSRF token untuk admin mutating API | `src/admin/`, `public/admin/` | M | PUT/POST admin butuh token valid |
| 4.4 | Audit log admin actions | `src/admin/` | M | Log: login, edit KB, update booking, edit settings |
| 4.5 | Mask API keys di settings UI | `public/admin/app.js` | S | Key ditampilkan sebagai `sk-***...***` |

---

## Sprint 5 — Observability & Cost Control (P2)

**Durasi:** 3–4 hari  
**Tujuan:** Pantau biaya LLM dan kesehatan sistem

| # | Task | File/Area | Effort | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 5.1 | Request logging terstruktur | `src/web/server.ts` | M | Log: chatId, duration, tokens (jika ada), status |
| 5.2 | Metrics endpoint `/api/metrics` | baru | M | Total chat, error rate, avg latency (admin-only) |
| 5.3 | Daily LLM usage counter | SQLite table baru | M | Hitung jumlah request/hari per channel |
| 5.4 | Health check extended | `/api/health` | S | Tambah: DB ok, disk space, uptime |
| 5.5 | Alert webhook (opsional) | env + script | S | Notifikasi jika health fail 3x berturut |

---

## Sprint 6 — Arsitektur & DX (P3)

**Durasi:** 5–8 hari  
**Tujuan:** Skalabilitas jangka panjang (hanya jika traffic naik)

| # | Task | File/Area | Effort | Acceptance Criteria |
|---|------|-----------|--------|---------------------|
| 6.1 | Migrasi routing ke Hono/Fastify | `src/web/server.ts` | L | Semua route & middleware terpindah |
| 6.2 | Pisahkan `server.ts` (413 baris) | `src/web/routes/` | M | Modul: chat, admin, static |
| 6.3 | Env validation dengan Zod | `src/config/` | M | Startup fail cepat jika env invalid |
| 6.4 | CI pipeline (build + test) | GitHub Actions | M | PR otomatis run `build:all` + `test` |
| 6.5 | Pertimbangkan Redis untuk rate limit | infra | L | Multi-instance ready |

---

## Roadmap

```
Minggu 1–2   ██████████ Sprint 1 (P0 Security)        ✅
Minggu 2–3   ████████████ Sprint 2 (P1 Stability)     ✅
Minggu 4–5   ██████████████ Sprint 3 (P1 Testing)
Minggu 6     ████████ Sprint 4 (P2 Admin)
Minggu 7     ██████ Sprint 5 (P2 Observability)
Minggu 8+    ████████████ Sprint 6 (P3 Architecture) — opsional
```

**Urutan eksekusi:** Sprint 1 → 2 → 3 → (4 & 5 paralel) → 6 jika perlu