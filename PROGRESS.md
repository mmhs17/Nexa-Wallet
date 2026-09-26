# NEXA Wallet — Build Progress

**Product:** NEXA Wallet — *Pay Smart. Stay Protected.*
**Creator:** Mohd Manzoor Hussain Siddiqui

## Phase checklist

- [x] **Phase 1a** — Environment + Docker + DB migration
  - `.env.example`, `docker-compose.yml` (Postgres on host port 5433)
  - Prisma schema (users, wallets, transactions, risk, beneficiaries,
    payment methods/requests, recurring, notifications, security events,
    sessions, 2FA, recovery codes, fraud alerts, audit logs, categories)
  - Initial migration applied; `config/` + `utils/` helpers
- [x] **Phase 1b** — Backend foundation (middleware, app, server)
  - `src/middleware/`: error handler, JWT auth + RBAC, validation wrapper, rate limiters
  - `src/app.js` (helmet/cors/morgan/cookies/limits/routes/errors)
  - `src/server.js` (boot banner, graceful shutdown)
  - `GET /api/health` liveness probe — verified working
- [x] **Phase 2** — Authentication + 2FA (register, login, JWT rotation,
  sessions, TOTP, recovery codes, lockout, password reset)
  - `src/services/`: auth, token, session, twoFactor, mail, audit, security
  - `src/controllers/`: auth.controller, twoFactor.controller
  - `src/routes/auth.routes.js` mounted at `/api/auth`
  - Verified live: register → verify → login → /me → 2FA setup QR →
    bad-code 401 → lockout after 5 fails → forgot/reset → change pw →
    logout → 401 on revoked session
- [x] **Phase 3** — Wallet + P2P payments
  - `src/services/wallet.service.js`: `getWallet`, `addMoney`, `withdraw`,
    `sendMoney` (atomic `$transaction` + balance re-check), `resolveRecipient`,
    `getRecipientProfile` (New/Recent/Established trust), `listCategories`
  - `src/controllers/wallet.controller.js` + `src/routes/wallet.routes.js`
    mounted at `/api/wallet` (auth + payment rate limiter)
  - Verified live: wallet 0 → add ₹25,000 → send ₹5,000 (friend1 credited
    ₹5,000, profile flips New→Recent) → withdraw ₹2,000 → final ₹16,000;
    self-send 400 + overdraft/insufficient-funds correctly rejected
  - Note: shell-level `DATABASE_URL` (stale `nexa_secret` pw) overrides `.env`;
    unset it before `node src/server.js` — `.env` uses `nexa_password`
- [x] **Phase 4** — Transaction system (ledger, filters, CSV export, receipts)
  - `src/services/transaction.service.js`: `listTransactions` (paginated,
    ownership-gated `senderId/receiverId` scope), `getTransaction` (by id or
    reference), `getReceipt` (sandbox-stamped payload), `exportTransactionsCsv`
    (≤5000 rows), `assertTransactionVisible` (fraud/admin reuse)
  - Rows stamped viewer-relative `direction` (CREDIT/DEBIT) + counterparty
    identity + category; filters: type/status/direction/categoryId/reference/
    search(date/from-to/min-max amount) + sort createdAt/amount
  - `src/controllers/transaction.controller.js` +
    `src/routes/transaction.routes.js` mounted at `/api/transactions`
    (auth on all; `/export` before `/:id`); validators 422 on bad enums
  - Verified live: 8-row ledger (add/send/withdraw), SEND+DEBIT=4,
    minAmount+sort, search=coffee=2, pagination, detail by id+ref, receipt,
    CSV header+rows, type=BOGUS→422, no-auth→401, stranger→404
- [x] **Phase 5** — Explainable Fraud Intelligence (`src/services/fraud-engine/`)
  - `rules.js`: pure 9-rule scorer (NEW_RECIPIENT_LARGE 30, LARGE_AMOUNT 30/20/10,
    ROUND_AMOUNT 10, RAPID_SUCCESSION 20, LATE_NIGHT 10, UNVERIFIED_ACCOUNT 10,
    FRESH_ACCOUNT 15, HIGH_VELOCITY_DAY 15, NEW_DEVICE 15) → score/level/decision;
    bands: <60 ALLOW, 60–84 REVIEW, ≥85 BLOCK; every factor = {code, points, detail}
  - `fraud-engine/fraud.service.js`: `buildSendContext` (beneficiary count, 15-min
    + 24-h velocity, sender verify/age, device recognition), `scoreSend`,
    `persistDecision` (TransactionRisk always + FraudAlert OPEN on REVIEW/BLOCK,
    featureVector captured for future ML), `explainAssessment`
  - `wallet.sendMoney`: scores BEFORE money moves — BLOCK → 402 PAYMENT_BLOCKED
    with factors + BLOCKED ledger row + alert (no funds move); REVIEW →
    UNDER_REVIEW txn + escrow (sender balance→pendingBalance, receiver
    pendingBalance); ALLOW → normal COMPLETED flow; response carries risk block
  - `src/services/fraud.service.js` + controller + routes at `/api/fraud`
    (auth): POST /preflight (no-write score mirror), GET /assessments,
    GET /alerts?status=, GET /transactions/:id/assessment (403 for strangers)
  - Transaction list/detail rows now embed explainable `risk` (factors, reasons,
    decision, engineVersion) via `explainRisk`
  - Verified live: preflight 75/REVIEW (writes nothing); ALLOW ₹500 → COMPLETED
    (score 15); REVIEW ₹60k first-time → UNDER_REVIEW + escrow (sender
    419000/pending 60000, receiver 0/pending 60000); BLOCK ₹1.2L fresh+new-device
    → 402 + BLOCKED row score 100 (6 factors) + OPEN alert; alerts
    ?status=OPEN total=2; stranger assessment 403; no-auth 401

- [x] **Phase 6** — Privacy Shield + Emergency Wallet Lock
  - `src/services/privacy.service.js`: `getPrivacy` (upsert defaults),
    `updatePrivacy` (boolean fields + autoLockMinutes 1–120, audited),
    `isShieldedFrom` (shielded user hidden from non-payees)
  - `PUT/GET /api/privacy` (controller + routes + validators mounted at
    `/privacy`): shieldActive, hideBalance, hideTransactionAmounts,
    hideRecipientNames, hideAnalytics, autoLockMinutes
  - Shield enforcement in `resolveRecipient(identifier, viewerId)`: shielded
    users get the same "not found" as unknown handles (anti-enumeration);
    senders/profile lookups/preflight pass viewerId; existing payees exempt
  - Emergency lock in wallet.service: `POST /wallet/security/lock` (instant
    self-freeze with reason, WALLET_FROZEN CRITICAL event + notification +
    audit), `GET /wallet/security/lock` (status + unlockAvailableAt),
    `POST /wallet/security/unlock` (30-min cooling-off via
    UNLOCK_COOLDOWN_MINUTES + argon2 password confirm; authLimiter-gated;
    audit FAILURE on wrong password)
  - Verified live: resolve 200→404 once shield on; send-to-shielded 404;
    lock→FROZEN + double-lock 400; add-money/withdraw 423 while locked;
    unlock-too-soon 403; backdated cooldown → wrong-pw 401 → unlock ACTIVE →
    payments resume; autoLockMinutes=500 422, shieldActive="banana" 422,
    no-auth 401

- [x] **Phase 7** — Security Center
  - `src/services/security-center.service.js`: composite `getOverview`
    (explainable posture score /100 — 2FA 30, verified email 15, no OPEN fraud
    alerts 20, no failed logins 24h 20, wallet not frozen 15 — plus 2FA status,
    wallet-lock state, privacy shield, device sessions w/ current flagged,
    unread notifications), `listEvents` (paginated timeline, filters
    type/severity/since, 422 on bad enums), `listSessions`, `revokeOneSession`
    (ownership-checked 404 for strangers), `revokeOtherSessions`
  - `/api/security` (controller + validators + routes, auth on all):
    GET /overview, GET /events, GET /sessions,
    POST /sessions/revoke-all (before /:sessionId), DELETE /sessions/:sessionId
  - **Session binding hardened** (`auth.middleware.authenticate`): every
    authenticated request now verifies its `sid` against UserSession —
    revoked/expired sessions kill access tokens instantly. Rewrote to
    Express-4-safe callback style (async middleware rejection was crashing
    Node); added unhandledRejection/uncaughtException guards in server.js
  - Verified live: posture 35/100 AT_RISK with factor breakdown; timeline
    shows LOGIN_FAILED/LOGIN_SUCCESS/SESSION_REVOKED (filters LOGIN_FAILED=5,
    CRITICAL=0); 5 sessions listed w/ current flagged; revoke other → its
    token 401 on /me; revoke-all keeps current (total=1); unknown session
    404; stranger's session 404; no-auth 401; type=BOGUS 422

- [x] **Phase 8** — Financial Analytics
  - `src/services/analytics.service.js`: `getSummary` (money in/out/net, top category, top counterparty, deltas vs previous period),
    `getCategoryBreakdown`, `getCounterparties`, `getTrend` (day/week/month buckets), `getInsights` (explainable, same factor style as the fraud engine)
  - `src/controllers/analytics.controller.js` + `src/routes/analytics.routes.js` mounted at
    `/api/analytics`: /summary, /spending, /counterparties, /trends, /insights (auth + period validators)
  - Verified live: summary (₹ totals, net positive/negative, category share), spending breakdown,
    counterparties, trends buckets, insights array; no-auth→401, period=bogus→422
- [x] **Phase 9** — NEXA Intelligence Assistant (re-verified 2026-09-17)
  - `src/services/intelligence.service.js`: `gatherContext` (wallet + balance, 2FA,
    Privacy Shield, 30-day analytics + insights, recent 10 txns with risk scores,
    open fraud alerts, Security Center posture), `chat` (gathers context →
    OpenRouter chat completions via OpenAI-compatible format with graceful
    rules-fallback when key absent or upstream errors), `getContext`
  - `src/controllers/intelligence.controller.js` + `src/routes/intelligence.routes.js`
    mounted at `/api/intelligence`: GET /context, POST /chat (auth + payment
    limiter + message validator)
  - `src/validators/intelligence.validators.js`: message required, trimmed, ≤2000 chars
  - OpenRouter config in `src/config/env.js` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
    `OPENROUTER_BASE_URL`)
  - Verified live via `backend/test-phase9.mjs`: /context returns full explainable
    context; /chat answers balance/fraud/security/spend questions; fallback mode
    active without AI key; empty→422, missing→422, >2000 chars→422, no-auth→401;
    per-user scoping confirmed (ALL PHASE 9 CHECKS PASSED); probe scripts removed
- [x] **Phase 10** — Admin Fraud Command Center + Audit (verified 2026-09-17)
  - `src/services/admin.service.js`: queue stats, flagged-txn queue, global alert
    queue + detail, claim (OPEN→REVIEWING), resolve (APPROVE releases UNDER_REVIEW
    escrow / override-settles BLOCKED; REJECT reverses escrow / closes BLOCKED),
    user directory + dossier, suspend/reactivate (revokes sessions, notifies),
    immutable audit-log listing — every admin action writes audit + notifies owner
  - `src/controllers/admin.controller.js` + `src/routes/admin.routes.js` mounted
    at `/api/admin` (auth + requireAdmin → user 403, no-token 401); thin envelope
    layer with `paginated` meta
  - `src/validators/admin.validators.js`: pagination/status/sort, alertId/userId
    params, resolve decision+note, setStatus ACTIVE|SUSPENDED, audit filters
  - Verified live via `backend/test-phase10.mjs` (dynamic admin/user/target,
    no hardcoded ids): stats, alerts+detail, flagged txns, claim-safe target,
    REJECT (BLOCKED→REVERSED, ledger verified), re-resolve→400, users+dossier
    (no passwordHash), audit trail with FRAUD_ALERT_*, bad decision→422,
    bad actorRole→422 (ALL PHASE 10 CHECKS PASSED)
- [ ] **Phase 11** — Frontend (all pages) + UI polish
- [ ] **Phase 12** — Seed data + testing + README/docs

## How to run (backend, Phase 1b)

```powershell
cd c:\nexa-wallet
docker compose up -d              # Postgres on localhost:5433
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev                       # http://localhost:4000/api/health
```
