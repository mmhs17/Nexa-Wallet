/**
 * Local smoke test: verify the API is reachable and produce a
 * known-good login for the browser. Registers + verifies a fresh
 * demo user if no existing account accepts the known password.
 */
import prisma from "./src/config/prisma.js";

const BASE = "http://localhost:4000/api";
const DEMO_PASSWORD = "Test@1234";

async function call(method, path, token, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, ok: res.ok, json };
}

async function tryLogin(identifier) {
    const r = await call("POST", "/auth/login", null, { identifier, password: DEMO_PASSWORD });
    if (r.ok) return { identifier, ...r.json.data };
    return null;
}

console.log("=== account state ===");
const accounts = await prisma.user.findMany({
    select: { username: true, status: true, failedLoginAttempts: true, emailVerified: true, lockedUntil: true },
    orderBy: { createdAt: "asc" },
});
console.log("total users:", accounts.length);
for (const a of accounts.slice(0, 8)) {
    console.log(` - ${a.username} status=${a.status} attempts=${a.failedLoginAttempts} verified=${a.emailVerified} locked=${a.lockedUntil ?? "-"}`);
}

console.log("\n=== try known-password logins ===");
const candidates = accounts.map((a) => a.username);
let session = null;
for (const c of candidates) {
    const s = await tryLogin(c);
    if (s) { session = { ...s, identifier: c }; console.log(`OK: ${c}`); break; }
}
if (!session) console.log("no existing account accepted the known password");

if (!session) {
    console.log("\n=== creating a fresh demo user ===");
    const ts = Date.now().toString(36);
    const user = {
        username: `demo${ts}`,
        email: `demo${ts}@nexa.test`,
        password: DEMO_PASSWORD,
        fullName: "NEXA Demo User",
    };
    const reg = await call("POST", "/auth/register", null, user);
    console.log("register:", reg.status, reg.ok ? "ok" : JSON.stringify(reg.json).slice(0, 300));
    const token = reg.json?.data?.emailVerifyToken;
    if (token) {
        const ver = await call("POST", "/auth/verify-email", null, { token });
        console.log("verify-email:", ver.status);
    }
    const s = await tryLogin(user.username);
    if (s) {
        session = { ...s, identifier: user.username };
        console.log(`OK: ${user.username}`);
    }
}

if (!session) {
    console.error("\nFAILED: could not obtain a session");
    await prisma.$disconnect();
    process.exit(1);
}

console.log("\n=== authenticated endpoint checks ===");
const token = session.accessToken;
for (const [label, path] of [
    ["wallet", "/wallet"],
    ["privacy", "/privacy"],
    ["transactions", "/transactions?page=1&pageSize=5"],
    ["beneficiaries", "/beneficiaries"],
    ["requests", "/requests?box=received"],
    ["requests(sent)", "/requests?box=sent"],
    ["recurring", "/recurring-payments"],
    ["notifications", "/notifications?limit=5"],
    ["categories", "/wallet/categories"],
    ["security", "/security/overview"],
]) {
    const r = await call("GET", path, token);
    const d = r.json?.data;
    const size = Array.isArray(d) ? `array[${d.length}]` : d && typeof d === "object" ? "object" : String(d);
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.status} GET ${path} -> ${size}`);
}

console.log("\n=== recurring-payment create/round-trip ===");
const other = accounts.find((a) => a.username !== session.identifier);
if (other) {
    const created = await call("POST", "/recurring-payments", token, {
        to: other.username, amount: 500, frequency: "MONTHLY", note: "Local smoke",
    });
    console.log(`POST /recurring-payments -> ${created.status}`, created.ok ? `id=${created.json.data.id} label=${created.json.data.frequencyLabel}` : JSON.stringify(created.json).slice(0, 200));
    if (created.ok) {
        const id = created.json.data.id;
        const paused = await call("POST", `/recurring-payments/${id}/pause`, token, {});
        console.log(`pause -> ${paused.status} status=${paused.json?.data?.status}`);
        const resumed = await call("POST", `/recurring-payments/${id}/resume`, token, {});
        console.log(`resume -> ${resumed.status} status=${resumed.json?.data?.status}`);
        const del = await call("DELETE", `/recurring-payments/${id}`, token);
        console.log(`delete -> ${del.status} ${JSON.stringify(del.json?.data)}`);
    }
}

console.log("\n=== LOGIN FOR BROWSER ===");
console.log("identifier:", session.identifier);
console.log("password  :", DEMO_PASSWORD);
console.log("twoFactor :", session.twoFactorRequired ? "REQUIRED" : "not required");

await prisma.$disconnect();
