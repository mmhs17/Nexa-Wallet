/**
 * Phase 8 — Financial Analytics live verification.
 * Hits every /api/analytics endpoint against the running server and
 * prints full payloads so results can be eyeballed, plus hard assertions.
 */

const BASE = "http://localhost:4000/api";
let failures = 0;

function check(name, cond, extra = "") {
    if (cond) console.log(`  PASS  ${name}`);
    else {
        failures++;
        console.log(`  FAIL  ${name} ${extra}`);
    }
}

async function login(identifier, password) {
    const r = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`login failed ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const d = j.data || {};
    return d.accessToken || d.token || d.tokens?.accessToken;
}

async function get(path, token) {
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => null);
    return { status: r.status, j };
}

const token = await login("phase5main", "Test@1234");
check("login phase5main", Boolean(token));

console.log("\n=== GET /analytics/summary?period=30d ===");
{
    const { status, j } = await get("/analytics/summary?period=30d", token);
    console.log(JSON.stringify(j, null, 1).slice(0, 1200));
    check("200", status === 200);
    check("success envelope", j?.success === true);
    check("data.moneyIn number", typeof j?.data?.moneyIn === "number");
    check("data.moneyOut number", typeof j?.data?.moneyOut === "number");
    check("moneyIn > 0 (has ledger)", (j?.data?.moneyIn ?? 0) > 0 || (j?.data?.moneyOut ?? 0) > 0);
}

console.log("\n=== GET /analytics/summary?period=7d ===");
{
    const { status, j } = await get("/analytics/summary?period=7d", token);
    check("200", status === 200);
    check("success", j?.success === true);
}

console.log("\n=== GET /analytics/spending?period=30d ===");
{
    const { status, j } = await get("/analytics/spending?period=30d", token);
    console.log(JSON.stringify(j, null, 1).slice(0, 900));
    check("200", status === 200);
    check("categories array", Array.isArray(j?.data?.categories || j?.data?.items || j?.data));
}

console.log("\n=== GET /analytics/counterparties?period=30d ===");
{
    const { status, j } = await get("/analytics/counterparties?period=30d", token);
    console.log(JSON.stringify(j, null, 1).slice(0, 900));
    check("200", status === 200);
    check("list present", Array.isArray(j?.data?.counterparties || j?.data?.items || j?.data));
}

console.log("\n=== GET /analytics/trends?period=30d ===");
{
    const { status, j } = await get("/analytics/trends?period=30d", token);
    console.log(JSON.stringify(j, null, 1).slice(0, 900));
    check("200", status === 200);
    check("buckets array", Array.isArray(j?.data?.buckets || j?.data?.trend || j?.data));
}

console.log("\n=== GET /analytics/insights?period=30d ===");
{
    const { status, j } = await get("/analytics/insights?period=30d", token);
    console.log(JSON.stringify(j, null, 1).slice(0, 1200));
    check("200", status === 200);
    check("insights array", Array.isArray(j?.data?.insights || j?.data));
}

console.log("\n=== NEGATIVES ===");
{
    const noAuth = await fetch(`${BASE}/analytics/summary`);
    check("no token -> 401", noAuth.status === 401);

    const { status } = await get("/analytics/summary?period=bogus", token);
    check("period=bogus -> 422", status === 422, `got ${status}`);

    // Ownership: friend1 must not see phase5main's numbers (independent login).
    const t2 = await login("friend1", "Test@1234");
    const a = await get("/analytics/summary?period=30d", token);
    const b = await get("/analytics/summary?period=30d", t2);
    check("per-user scoping differs", JSON.stringify(a.j.data) !== JSON.stringify(b.j.data));
}

console.log(failures === 0 ? "\nALL PHASE 8 CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);