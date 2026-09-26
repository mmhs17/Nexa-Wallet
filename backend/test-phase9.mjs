/**
 * Phase 9 — NEXA Intelligence Assistant live verification.
 * Hits every /api/intelligence endpoint against the running server and
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
    const d = j.data || d;
    return d.accessToken;
}

async function post(path, token, body) {
    const r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    return { status: r.status, j };
}

async function get(path, token) {
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => null);
    return { status: r.status, j };
}

const token = await login("phase5main", "Test@1234");
check("login phase5main", Boolean(token));

console.log("\n=== GET /intelligence/context ===\n");
{
    const { status, j } = await get("/intelligence/context", token);
    console.log(JSON.stringify(j, null, 1).slice(0, 1500));
    check("200", status === 200);
    check("success envelope", j?.success === true);
    check("data.wallet present", typeof j?.data?.wallet === "object");
    check("data.user.fullName present", typeof j?.data?.user?.fullName === "string");
    check("data.twoFactor.enabled boolean", typeof j?.data?.twoFactor?.enabled === "boolean");
    check("data.security.posture number", typeof j?.data?.security?.posture === "number");
    check("data.analytics present", typeof j?.data?.analytics === "object");
}

console.log("\n=== POST /intelligence/chat — balance question ===\n");
{
    const { status, j } = await post("/intelligence/chat", token, { message: "What is my wallet balance?" });
    console.log(JSON.stringify(j, null, 1).slice(0, 1000));
    check("200", status === 200);
    check("success envelope", j?.success === true);
    check("reply string", typeof j?.data?.reply === "string" && j.data.reply.length > 10);
    check("model present", typeof j?.data?.model === "string");
    check("context included", typeof j?.data?.context === "object");
}

console.log("\n=== POST /intelligence/chat — fraud question ===\n");
{
    const { status, j } = await post("/intelligence/chat", token, { message: "Tell me about my fraud risk and any alerts." });
    console.log(JSON.stringify(j, null, 1).slice(0, 1000));
    check("200", status === 200);
    check("success", j?.success === true);
    check("reply mentions", typeof j?.data?.reply === "string");
}

console.log("\n=== POST /intelligence/chat — empty message ===\n");
{
    const { status, j } = await post("/intelligence/chat", token, { message: "" });
    console.log(JSON.stringify(j, null, 1));
        check("422 (validation)", status === 422, `got ${status}`);
}

console.log("\n=== POST /intelligence/chat — no message field ===\n");
{
    const { status, j } = await post("/intelligence/chat", token, {});
    console.log(JSON.stringify(j, null, 1));
    check("400 or 422", status === 400 || status === 422, `got ${status}`);
}

console.log("\n=== POST /intelligence/chat — message too long ===\n");
{
    const longMsg = "x".repeat(2001);
    const { status, j } = await post("/intelligence/chat", token, { message: longMsg });
    console.log(JSON.stringify(j, null, 1).slice(0, 400));
    check("422", status === 422, `got ${status}`);
}

console.log("\n=== NEGATIVES ===\n");
{
    // No auth → 401
    const noAuth = await fetch(`${BASE}/intelligence/context`);
    check("no token -> 401", noAuth.status === 401);

    // Friend1 must see different data (per-user scoping)
    const friendToken = await login("friend1", "Test@1234");
    const a = await get("/intelligence/context", token);
    const b = await get("/intelligence/context", friendToken);
    check("per-user context differs", JSON.stringify(a.j.data.user) !== JSON.stringify(b.j.data.user));
    check("per-user wallet differs or user differs", a.j.data.user.nexaId !== b.j.data.user.nexaId);

    // Chat also scoped
    const chatA = await post("/intelligence/chat", token, { message: "Hello" });
    const chatB = await post("/intelligence/chat", friendToken, { message: "Hello" });
    check("chat scoped per user", chatA.j.data.context.user.nexaId !== chatB.j.data.context.user.nexaId);
}

console.log(failures === 0 ? "\nALL PHASE 9 CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
