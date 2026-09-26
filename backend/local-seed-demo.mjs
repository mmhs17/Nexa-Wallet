/**
 * Seed a small amount of demo data for the local browser session,
 * so the UI screens have content to render. Idempotent-ish: skips
 * creates when equivalent rows already exist for the user.
 */
const BASE = "http://localhost:4000/api";
const LOGIN = { identifier: "friend1", password: "Test@1234" };

async function call(method, path, token, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, ok: res.ok, json };
}

const login = await call("POST", "/auth/login", null, LOGIN);
if (!login.ok) {
    console.error("login failed", login.status, JSON.stringify(login.json).slice(0, 300));
    process.exit(1);
}
const token = login.json.data.accessToken;
const me = login.json.data.user;
console.log(`logged in as ${me.username} (${me.nexaId})`);

/* Pick some distinct counterparties. */
const resolve = await call("GET", "/wallet/recipients/resolve?q=phase4other", token);
const peers = ["phase4other", "phase5main", "phase4test"].filter((u) => u !== me.username);

/* Beneficiaries */
const existingB = await call("GET", "/beneficiaries", token);
const haveB = new Set((existingB.json?.data || []).map((b) => b.handle));
let bCount = 0;
for (const [i, p] of peers.entries()) {
    if (haveB.has(p)) continue;
    const r = await call("POST", "/beneficiaries", token, {
        identifier: p,
        nickname: i === 0 ? "Rent Landlord" : i === 1 ? "Coffee Buddy" : null,
        isFavorite: i === 0,
    });
    if (r.ok) { bCount++; console.log(` + beneficiary ${r.json.data.displayName} (${r.json.data.handleType})`); }
    else console.log(` ! beneficiary ${p}: ${r.status} ${JSON.stringify(r.json?.error)}`);
}

/* Payment requests (sent by me => appear in "sent" box) */
const existingR = await call("GET", "/requests?box=sent", token);
let rCount = 0;
if ((existingR.json?.data || []).length === 0) {
    for (const [i, p] of peers.slice(0, 2).entries()) {
        const r = await call("POST", "/requests", token, {
            to: p, amount: 250 + i * 175, note: i === 0 ? "Lunch split" : "Cab fare",
        });
        if (r.ok) { rCount++; console.log(` + request -> ${p} ₹${r.json.data.amount}`); }
        else console.log(` ! request ${p}: ${r.status} ${JSON.stringify(r.json?.error)}`);
    }
}

/* Recurring payments */
const existingRec = await call("GET", "/recurring-payments", token);
let recCount = 0;
if ((existingRec.json?.data || []).length === 0) {
    for (const [i, p] of peers.slice(0, 2).entries()) {
        const r = await call("POST", "/recurring-payments", token, {
            to: p,
            amount: 5000 + i * 2500,
            frequency: i === 0 ? "MONTHLY" : "WEEKLY",
            note: i === 0 ? "House rent" : "Gym membership",
        });
        if (r.ok) { recCount++; console.log(` + recurring -> ${p} ₹${r.json.data.amount} ${r.json.data.frequencyLabel}`); }
        else console.log(` ! recurring ${p}: ${r.status} ${JSON.stringify(r.json?.error)}`);
    }
}

console.log(`\nseeded: ${bCount} beneficiaries, ${rCount} requests, ${recCount} recurring`);

const summary = {};
for (const [label, path] of [
    ["beneficiaries", "/beneficiaries"],
    ["requests(received)", "/requests?box=received"],
    ["requests(sent)", "/requests?box=sent"],
    ["recurring", "/recurring-payments"],
    ["notifications", "/notifications?limit=50"],
    ["transactions", "/transactions?page=1&pageSize=5"],
]) {
    const r = await call("GET", path, token);
    const d = r.json?.data;
    summary[label] = Array.isArray(d) ? `${d.length} rows` : d && typeof d === "object" ? `keys=${Object.keys(d).join(",")}` : String(d);
}
console.log("\n=== final UI payload sizes ===");
for (const [k, v] of Object.entries(summary)) console.log(` ${k.padEnd(20)} ${v}`);
