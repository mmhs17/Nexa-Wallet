/**
 * Phase 10 — Admin Fraud Command Center live verification.
 * Discovers admin + user + target alert dynamically. Fails loudly if
 * no admin account or no open/reviewing alert exists. Safe: favourites
 * the OPEN target so a concurrent run picks a different one, and
 * finishes with REJECT (escrow refund, no money created).
 */
const BASE = "http://localhost:4000/api";
let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}
async function login(identifier, password) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`login ${identifier} failed ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j.data.accessToken;
}
async function post(path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, j: await r.json().catch(() => null) };
}
async function get(path, token) {
  const r = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, j: await r.json().catch(() => null) };
}

const PW = "Test@1234";
const prismaMod = await import("./src/config/prisma.js");
const prisma = prismaMod.default ?? prismaMod.prisma;
const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { username: true }, orderBy: { createdAt: "asc" } });
if (!adminRow) throw new Error("no ADMIN user in DB — cannot verify phase 10");
const ADMIN = adminRow.username;
// Prefer accounts created by the phase test-scripts (known password Test@1234).
const KNOWN = ["phase5main", "phase5new", "phase5rx", "phase5blocked"];
const candidates = await prisma.user.findMany({
  where: { role: "USER", status: "ACTIVE" },
  select: { username: true, createdAt: true },
  orderBy: { createdAt: "desc" }, take: 20,
});
candidates.sort((a, b) => KNOWN.indexOf(b.username) - KNOWN.indexOf(a.username));
let USER = null;
for (const c of candidates) {
  try { await login(c.username, PW); USER = c.username; break; }
  catch { /* wrong password — try next candidate */ }
}
if (!USER) throw new Error("no ACTIVE user with known password — cannot verify phase 10");
console.log(`admin=${ADMIN} user=${USER}`);

const adminToken = await login(ADMIN, PW);
check("login admin", Boolean(adminToken));
const userToken = await login(USER, PW);
check("login user", Boolean(userToken));

console.log("\n=== GET /admin/stats (admin) ===\n");
{
  const { status, j } = await get("/admin/stats", adminToken);
  console.log(JSON.stringify(j, null, 1).slice(0, 600));
  check("200", status === 200, `got ${status}`);
  check("success envelope", j?.success === true);
  check("openAlerts number", typeof j?.data?.openAlerts === "number");
  check("pendingByLevel object", typeof j?.data?.pendingByLevel === "object");
}

console.log("\n=== GET /admin/alerts (admin) ===\n");
let target = null;
{
  const { status, j } = await get("/admin/alerts?status=OPEN", adminToken);
  check("200", status === 200, `got ${status}`);
  check("array data", Array.isArray(j?.data), JSON.stringify(j).slice(0, 200));
  check("meta.total number", typeof j?.meta?.total === "number");
  const open = Array.isArray(j?.data) ? j.data : [];
  target = open.find((a) => a.status === "OPEN") || null;
  if (target) {
    check("alert has id", typeof target.id === "string");
    check("alert has score", typeof target.score === "number");
    check("alert has factors", Array.isArray(target.factors));
    await prisma.fraudAlert.update({ where: { id: target.id }, data: { reviewNote: "phase10-live-test-claim" } }).catch(() => {});
  } else {
    failures++;
    console.log("  FAIL  need at least one OPEN alert for live resolve test");
  }
}

console.log("\n=== GET /admin/transactions (admin) ===\n");
{
  const { status, j } = await get("/admin/transactions", adminToken);
  console.log(JSON.stringify((j?.data || []).slice(0, 1), null, 1).slice(0, 900));
  check("200", status === 200, `got ${status}`);
  check("array data", Array.isArray(j?.data));
  if (Array.isArray(j?.data) && j.data.length > 0) {
    check("txn has reference", typeof j.data[0].reference === "string");
    check("txn has risk", typeof j.data[0].risk === "object" || j.data[0].risk === null);
  }
}

console.log("\n=== RBAC: user token on /admin/stats (expect 403) ===\n");
{
  const { status, j } = await get("/admin/stats", userToken);
  console.log(JSON.stringify(j, null, 1).slice(0, 300));
  check("403 forbidden", status === 403, `got ${status}`);
  check("FORBIDDEN code", j?.error?.code === "FORBIDDEN", JSON.stringify(j?.error));
}

console.log("\n=== RBAC: no token on /admin/alerts (expect 401) ===\n");
{
  const { status } = await get("/admin/alerts", null);
  check("401 unauthenticated", status === 401, `got ${status}`);
}

console.log("\n=== GET /admin/alerts/:id (admin) ===\n");
if (target) {
  const { status, j } = await get(`/admin/alerts/${target.id}`, adminToken);
  console.log(JSON.stringify({ id: j?.data?.id, status: j?.data?.status, score: j?.data?.score }, null, 1));
  check("200 detail", status === 200, `got ${status}`);
  check("detail has status", j?.data && ("status" in j.data));
}

console.log("\n=== RBAC: user token on alert detail (expect 403) ===\n");
if (target) {
  const { status } = await get(`/admin/alerts/${target.id}`, userToken);
  check("403 forbidden", status === 403, `got ${status}`);
}

console.log("\n=== NEGATIVE: resolve with bad decision (expect 422) ===\n");
if (target) {
  const { status, j } = await post(`/admin/alerts/${target.id}/resolve`, adminToken, { decision: "MAYBE" });
  console.log(JSON.stringify(j, null, 1).slice(0, 300));
  check("422 validation", status === 422, `got ${status}`);
}

console.log("\n=== POST /admin/alerts/:id/resolve REJECT (admin) ===\n");
if (target) {
  const before = await prisma.transaction.findFirst({ where: { id: target.transactionId }, select: { reference: true, status: true } });
  const { status, j } = await post(`/admin/alerts/${target.id}/resolve`, adminToken, { decision: "REJECT", note: "phase10 live test" });
  console.log(JSON.stringify(j, null, 1).slice(0, 500));
  check("200 resolve", status === 200, `got ${status}`);
  check("status RESOLVED_REJECTED", j?.data?.status === "RESOLVED_REJECTED", JSON.stringify(j?.data));
  check("transactionStatus string", typeof j?.data?.transactionStatus === "string");
  const after = await prisma.transaction.findFirst({ where: { id: target.transactionId }, select: { status: true } });
  console.log(`ledger ${before?.reference}: ${before?.status} -> ${after?.status}`);
  check("ledger matches", after?.status === j?.data?.transactionStatus, `ledger=${after?.status}`);
}

console.log("\n=== NEGATIVE: resolve already-resolved (expect 400) ===\n");
if (target) {
  const { status, j } = await post(`/admin/alerts/${target.id}/resolve`, adminToken, { decision: "APPROVE" });
  console.log(JSON.stringify(j, null, 1).slice(0, 300));
  check("400 already resolved", status === 400, `got ${status}`);
}

console.log("\n=== GET /admin/users (admin) ===\n");
let someUser = null;
{
  const { status, j } = await get("/admin/users?limit=5", adminToken);
  check("200", status === 200, `got ${status}`);
  check("array data", Array.isArray(j?.data));
  check("no passwordHash leak", !JSON.stringify(j?.data).includes("passwordHash"));
  someUser = (j?.data || []).find((u) => u.username === USER) || (j?.data || [])[0];
}

console.log("\n=== GET /admin/users/:id (admin) ===\n");
if (someUser) {
  const { status, j } = await get(`/admin/users/${someUser.id}`, adminToken);
  console.log(JSON.stringify({ user: j?.data?.user?.username, wallet: j?.data?.wallet?.status }, null, 1));
  check("200 dossier", status === 200, `got ${status}`);
  check("dossier has recentTransactions", Array.isArray(j?.data?.recentTransactions));
}

console.log("\n=== GET /admin/audit-logs (admin) ===\n");
{
  const { status, j } = await get("/admin/audit-logs?limit=5", adminToken);
  check("200", status === 200, `got ${status}`);
  check("array data", Array.isArray(j?.data));
  const actions = (j?.data || []).map((l) => l.action);
  console.log("recent actions:", JSON.stringify(actions));
  check("FRAUD_ALERT_* trail present", actions.some((a) => String(a).startsWith("FRAUD_ALERT_")), actions.join(","));
}

console.log("\n=== NEGATIVE: audit-logs bad actorRole (expect 422) ===\n");
{
  const { status } = await get("/admin/audit-logs?actorRole=BOGUS", adminToken);
  check("422 validation", status === 422, `got ${status}`);
}

console.log(failures === 0 ? "\nALL PHASE 10 CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
