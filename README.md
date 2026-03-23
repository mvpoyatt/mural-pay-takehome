# Debugging Ducks — Mural Pay Take-Home

A marketplace where customers browse rubber ducks, pay in USDC on Polygon, and the merchant automatically receives Colombian Pesos (COP) via Mural Pay's sandbox API.

---

## Architecture

```
Customer browser
  ├── GET  /api/products              product catalog
  ├── POST /api/orders                create order (returns USDC amount + wallet address)
  ├── PATCH /api/orders/:id/confirm   store tx hash after wallet submission (UI path only)
  └── GET  /api/orders/:id            poll for PAID status

[Customer wallet] ──USDC transfer──▶ Mural Polygon wallet

Mural webhooks
  ├── MURAL_ACCOUNT_BALANCE_ACTIVITY  match payment → mark order PAID → initiate COP payout
  └── PAYOUT_REQUEST                  update withdrawal status (PENDING → PROCESSING → COMPLETED/FAILED)

Admin browser
  ├── GET  /api/merchant/orders       all orders with payment status
  └── GET  /api/merchant/withdrawals  all COP withdrawal records
```

**Stack:** TypeScript · Express · Prisma · Postgres · React · wagmi · Railway

---

## Local Setup

### Prerequisites

- Node.js 20+
- A Mural Pay sandbox account with API key and Transfer API key ([Sandbox docs](https://developers.muralpay.com/docs/sandbox-environment))
- A Postgres database (local or Railway)

### 1. Fill in credentials

Open `server/src/config.ts` and update `mural.apiKey` and `mural.transferApiKey` with your Mural sandbox API keys.

The account ID, counterparty, payout method, and webhook are all created or looked up automatically on server start — no manual setup needed beyond the API keys.

### 2. Set up the database

```bash
cd server
npm install
DATABASE_URL="postgresql://..." npx prisma migrate dev
DATABASE_URL="postgresql://..." npm run db:seed
```

### 3. Run the backend

```bash
cd server
# Create server/.env with: DATABASE_URL="postgresql://..." and PUBLIC_URL="https://your-tunnel-url"
npm run dev
# Server starts on http://localhost:3001
```

### 4. Run the frontend

```bash
cd client
npm install
npm run dev
# Opens http://localhost:5173 (proxies /api → localhost:3001)
```

### Webhook development

Mural requires a public HTTPS URL to deliver webhooks. Use [localtunnel](https://theboroer.github.io/localtunnel-www/) or [ngrok](https://ngrok.com/) during local testing:

```bash
npx localtunnel --port 3001
# Set PUBLIC_URL=https://xxx.loca.lt in server/.env and restart the server
```

The server registers the webhook automatically on startup and skips registration if `PUBLIC_URL` points to localhost.

---

## Railway Deployment

The repo has two Railway services, each with its own `railway.toml`:

| Service | Root Directory | Key env vars |
|---|---|---|
| `backend` | `/server` | `DATABASE_URL` (auto-injected by Postgres plugin), `RAILWAY_PUBLIC_DOMAIN` (auto-injected) |
| `frontend` | `/client` | `VITE_API_BASE_URL=https://<backend-service>.up.railway.app` |

Railway auto-detects Node.js and runs the build/start commands from `railway.toml`. The backend start command runs migrations and seed before starting the server.

---

## API Reference

Interactive docs are served at `/docs` (Swagger UI) and the raw spec at `/openapi.json`.

### Customer

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | List product catalog |
| `POST` | `/api/orders` | Create order · body: `{ customerName, customerEmail, items: [{productId, quantity}] }` |
| `PATCH` | `/api/orders/:id/confirm` | Store tx hash · body: `{ txHash }` · optional, improves payment matching |
| `GET` | `/api/orders/:id` | Get order status (poll after payment) |

### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/merchant/orders` | All orders with items and payment status |
| `GET` | `/api/merchant/withdrawals` | All COP withdrawal records |

### System

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhooks/mural` | Mural Pay event receiver (ECDSA-verified) |
| `GET` | `/health` | Liveness probe |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/openapi.json` | Raw OpenAPI spec |

**Auth:** Include `X-API-Key: mural-takehome-secret` on admin endpoints.

---

## Payment Flow

### How payment matching works

Standard USDC transfers carry no order metadata, so we use a two-stage matching strategy:

**Primary — tx hash matching**

1. After sending USDC, call `PATCH /api/orders/:id/confirm { txHash }` with the blockchain transaction hash.
2. When `MURAL_ACCOUNT_BALANCE_ACTIVITY` fires, the webhook's tx hash is matched directly against stored orders.

The frontend does this automatically — wagmi returns the tx hash the moment the customer approves the transfer. Curl users can also use this path by obtaining their tx hash from their wallet or a block explorer (e.g. [Polygon Amoy Scan](https://amoy.polygonscan.com)) and calling `PATCH /confirm` themselves before the webhook arrives.

**Fallback — amount matching (when no tx hash is on file)**

If `PATCH /confirm` was never called for the order, the server falls back to matching by USDC amount: it looks for the most recent `PENDING_PAYMENT` order with a matching `totalUsdc` and no tx hash stored. This handles the common curl testing flow of `POST /orders` → send USDC → wait for status to flip, without any extra steps.

**Known pitfalls:**

- **Same-amount collision**: two concurrent orders for the same product have identical USDC totals. Without amount fingerprinting there is no way to distinguish them — we pick the most recent, which may be wrong. Fingerprinting (adding sub-cent dust to each order amount) would solve this at the cost of requiring the customer to send an exact non-round amount. We chose simplicity; the assignment explicitly notes a fully bulletproof matching system is not expected.
- **Float equality**: `totalUsdc` is stored as a Postgres `FLOAT`, so exact equality comparisons can theoretically fail due to floating-point representation. Production would use `NUMERIC` for money values.
- **Unmatched payments**: if neither match succeeds, the payment is logged but not auto-refunded. A production system would need a manual resolution queue.
- **Late payments**: if an order is no longer `PENDING_PAYMENT` when the webhook fires, it goes unmatched.
- **Customers need MATIC for gas** on Polygon Amoy (standard ERC-20 transfer).

### Why not x402 / xtended402?

A cleaner approach would use the [x402 payment protocol](https://x402.org) — the customer signs an ERC-3009 authorization in the browser; the backend verifies and settles atomically in the same HTTP request, eliminating the async matching problem. This is exactly what the author's open-source [xtended402](https://github.com/mvpoyatt/xtended402) library implements.

The Polygon Amoy facilitator (`x402-amoy.polygon.technology`) only supports x402 **v1**, while xtended402 is built on **v2** — making them incompatible. Rather than ship a flaky integration on an untested facilitator, the simpler webhook approach was used instead.

---

## Current Status

The following is fully implemented and tested end-to-end:

The backend API is fully functional as a standalone service — all workflows can be exercised via curl using the endpoints documented above. The frontend is an optional component for easier testing; it is not required to use the API.

- **Backend**
  - All CRUD endpoints (products, orders, admin dashboard)
  - Server-side price calculation (client totals not trusted)
  - Tx hash matching (primary) + amount fallback (manual/curl senders)
  - `MURAL_ACCOUNT_BALANCE_ACTIVITY` webhook → auto COP payout (create + execute)
  - Payout status tracking via `PAYOUT_REQUEST` webhooks
  - ECDSA webhook signature verification
  - Idempotent startup initialization (wallet address, counterparty, payout method, webhook registration)
  - Prisma schema + seed data (3 duck products)
  - Swagger UI at `/docs`, raw spec at `/openapi.json`

- **Frontend**
  - Two-tab layout: Shop (customer) + Admin dashboard
  - Product catalog with quantity controls and cart
  - Checkout modal with wagmi wallet connection + USDC balance display
  - ERC-20 `transfer()` via `useWriteContract` (Polygon Amoy)
  - Polling for `PAID` status after transaction submission
  - Admin dashboard with tabbed Orders and COP Withdrawals views (auto-refreshes every 30s)

**What requires manual setup before first run:**
1. `server/src/config.ts` — fill in `mural.apiKey` and `mural.transferApiKey`
2. Railway env vars — `DATABASE_URL` (auto via Postgres plugin), `VITE_API_BASE_URL` for the frontend

---

## Future Work

- **Webhook replay / recovery**: If the server is down when Mural delivers a webhook (deploy, crash), the event is lost — Mural retries a limited number of times. Production would need a reconciliation job that periodically checks Mural's payout and transaction APIs to catch any events missed during downtime.

- **Self-hosted x402 facilitator**: Verify ERC-3009 signatures in-process with `viem`, call `transferWithAuthorization` on-chain from a backend wallet. Eliminates the async matching problem entirely and makes Mural a pure payout layer. ~1–2 days; [x402 repo](https://github.com/coinbase/x402) is open source as a reference. Given what Mural is building, this inline crypto-payment-as-middleware pattern could be a natural product offering.

- **Idempotent webhook handling**: Store processed `eventId`s to guard against duplicate `account_credited` deliveries triggering duplicate payouts.

- **Order expiry**: Background job to expire `PENDING_PAYMENT` orders after N hours, preventing stale orders from interfering with fallback amount matching.

- **Unmatched payment dashboard**: Admin view for payments that arrived but couldn't be matched to any order, enabling manual resolution / on-chain refund.

- **Multi-merchant support**: Per-merchant Mural accounts, payout configurations, and org model.

- **Real auth**: Replace hardcoded `X-API-Key` with JWT for customer sessions and merchant auth.

- **Secrets management**: Move API keys and credentials out of `config.ts` and into environment variables (or a secrets manager like AWS Secrets Manager / Railway's variable groups). Currently hardcoded per the assignment FAQ; not appropriate for production.

- **Connection pooling**: Add PgBouncer in front of Postgres for production-scale concurrency.

- **Webhook signature rotation**: Persist and rotate the Mural public key rather than caching in memory.

- **NUMERIC for money**: Replace `FLOAT` with `NUMERIC`/`DECIMAL` in the database schema to avoid floating-point precision issues in amount comparisons.
