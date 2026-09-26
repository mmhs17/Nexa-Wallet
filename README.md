# NEXA Wallet

**Pay Smart. Stay Protected.**

A security-first digital wallet built around intelligent payments, explainable fraud
detection, privacy protection, and user-controlled financial security.

> **Demo environment — no real money.** `SANDBOX_MODE` keeps all balances simulated.
> Payment gateway keys are test-mode only.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, React Router, Axios, Recharts, Lucide |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL 16 (Docker) |
| Auth | JWT (access + refresh), Argon2, TOTP 2FA, refresh-token sessions |
| AI | OpenRouter (optional) — NEXA Intelligence assistant |

---

## Prerequisites

- **Node.js 18+** and npm
- **Docker Desktop** (for PostgreSQL)

---

## Setup

There is **no root `package.json`** — the backend and frontend are installed and run separately.

### 1. Start the database

```bash
docker compose up -d postgres adminer
```

This starts:
- **PostgreSQL** on `localhost:5433` (user `nexa`, password `nexa_password`, db `nexa_wallet`)
- **Adminer** (optional DB UI) at http://localhost:5050 — login `admin@nexa.local` / `admin`

### 2. Configure environment

The template lives at the repo root; the backend reads it from `backend/.env`.

```bash
cp .env.example backend/.env
```

Generate the required secrets:

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY (32-byte hex, encrypts TOTP secrets at rest)
```

Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`.
Optional: SMTP (console transport is used when unset), `OPENROUTER_API_KEY` for the
AI assistant, gateway keys.

### 3. Install, migrate, seed

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

### 4. Run both servers

Two terminals:

```bash
cd backend  && npm run dev     # http://localhost:4000
cd frontend && npm run dev     # http://localhost:5173
```

Open **http://localhost:5173**.

Vite proxies `/api` → `http://localhost:4000`, so the browser only ever talks to
port 5173.

### Demo accounts

All seeded users share the password **`Test@1234`**.

| Username | NEXA ID | Balance |
|---|---|---|
| `friend1` | `NEXA-C5XT4` | ₹20,000 |
| `friend2` | `NEXA-D8K2M` | ₹15,000 |
| `phase4other` | `NEXA-GFKDM` | ₹10,000 |
| `phase4test` | `NEXA-H3R9P` | ₹10,000 |
| `phase5main` | `NEXA-J7N4Q` | ₹10,000 |

`npm run db:seed` is **idempotent** — safe to re-run; it refreshes password hashes
and reports which users were created vs. already existed.

---


## Features

**Three pillars of NEXA Security**

- **Explainable fraud intelligence** — every payment is scored 0–100 and each risk
  factor is returned with a human-readable reason, not just a flag. High-risk
  payments are held in escrow for review rather than silently dropped.
- **Privacy Shield** — user-controlled masking of balance and transaction amounts,
  plus privacy settings that hide you from other users' recipient search until you
  have transacted with them.
- **Emergency wallet lock** — freeze the wallet instantly to block outgoing
  payments and withdrawals, with recovery through the Security Center.

**Payments** — send and receive by username, email, phone, or NEXA ID; payment
requests; beneficiaries (saved recipients); recurring payments; add money;
transaction history with per-transaction risk detail.

**Account security** — 4-digit **transaction security key** (opt-in second factor
required for outgoing payments, with a 5-attempt / 10-minute lockout); TOTP 2FA;
email verification; password reset; account lockout; session management; and a
full audit trail.

**Platform** — fraud alert centre, privacy settings, notifications, analytics
dashboard, admin panel, and the NEXA Intelligence assistant.

---

## Project layout

```
nexa-wallet/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # 16 models
│   │   ├── seed.js              # idempotent demo data
│   │   └── migrations/
│   ├── src/
│   │   ├── config/              # env, prisma client
│   │   ├── controllers/         # request → service → response
│   │   ├── services/            # business logic
│   │   ├── routes/              # /auth, /wallet, /transactions, /fraud,
│   │   │                        #   /privacy, /security, /analytics,
│   │   │                        #   /intelligence, /admin, + extras
│   │   ├── validators/          # express-validator rule sets
│   │   ├── middleware/          # auth, validate, rate limit, errors
│   │   └── utils/               # typed errors, formatting
│   ├── test/                    # node:test suites
│   └── server.js / app.js
├── frontend/
│   └── src/
│       ├── pages/               # 26 routes
│       ├── components/          # shared UI + DemoDirectory
│       ├── context/             # auth state
│       ├── api/client.js        # axios instance + interceptors
│       └── utils/
├── docker-compose.yml           # postgres + adminer
└── .env.example
```

---

## Scripts

**Backend**

| Command | Purpose |
|---|---|
| `npm run dev` | Start with auto-reload (`node --watch`) |
| `npm start` | Start normally |
| `npm test` | Run the test suite |
| `npm run db:seed` | Seed/refresh demo accounts |
| `npm run seed:demo` | Seed a few live demo transactions |
| `npx prisma migrate dev` | Create + apply a migration |
| `npx prisma studio` | Browse the database |

**Frontend**

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |

---

## Testing

```bash
cd backend
npm test
```

Scoped to `test/*.test.mjs` and run with Node's built-in test runner — no extra
framework required.

The `test-phase*.mjs` files in `backend/` are **manual verification scripts**, not
unit tests. Run them individually via `npm run verify:phase8` … `verify:phase11a`.

---

## Troubleshooting

**Ports already in use** — 5173 (frontend) or 4000 (backend). Stop the other
process, or change the port in `frontend/vite.config.js` / `.env`.

**`P1001` can't reach the database** — the container isn't up. Run
`docker compose up -d postgres` and confirm with `docker ps`. Note the host port
is **5433**, not the default 5432.

**`Module not found` for `@prisma/client`** — run `npx prisma generate`.

**Requests fail with 429** — the global API limiter allows **300 requests per
15 minutes per IP**. Restarting the backend clears the in-memory counter.

**Login says the account is locked** — repeated failures trigger a temporary
lockout; wait it out or restart the backend.

---

## Notes

- `.env` is gitignored. Never commit real secrets.
- All demo balances and payments are simulated.
- Built and verified on Windows with PowerShell; the `cp` steps are shown in
  POSIX form — on PowerShell use `Copy-Item .env.example backend/.env`.
