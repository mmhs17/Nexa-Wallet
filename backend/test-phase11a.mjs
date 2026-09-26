/**
 * Phase 11a — Extras endpoints live verification.
 * Notifications, beneficiaries, requests (with real P2P accept),
 * recurring payments — run against the dev server on :4000.
 */

const BASE = "http://localhost:4000/api";
let failures = 0;

function check(name, cond, extra = "") {
    if (cond) console.log(`  PASS  ${name}`);
    else { failures++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function login(identifier, password) {
    const r = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`login failed ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return j.data.accessToken;
}

async function call(method, path, token, body) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    return { status: r.status, j };
}

const ts = Date.now().toString(36).slice(-6);
const A = { username: `p11a${ts}`, email: `p11a${ts}@nexa.test`, password: "Test@1234", fullName: `Phase11 A ${ts}` };
const B = { username: `p11b${ts}`, email: `p11b${ts}@nexa.test`, password: "Test@1234", fullName: `Phase11 B ${ts}` };

async function register(u) {
    const { j } = await call("POST", "/auth/register", null, u);
    const token = j?.data?.emailVerifyToken;
    if (token) await call("POST", "/auth/verify-email", null, { token });
    return login(u.username, u.password);
}

const aToken = await register(A);
const bToken = await register(B);
check("register+login A", Boolean(aToken));
check("register+login B", Boolean(bToken));

// Fund both wallets so B's accepted request can be paid.
await call("POST", "/wallet/add-money", aToken, { amount: 50000 });
await call("POST", "/wallet/add-money", bToken, { amount: 50000 });

console.log("\n=== NOTIFICATIONS ===");
{
    const { status, j } = await call("GET", "/notifications", aToken);
    check("GET /notifications 200", status === 200);
    check("items array", Array.isArray(j?.data?.items));
    check("unreadCount number", typeof j?.data?.unreadCount === "number");
    const first = j?.data?.items?.[0];
    if (first) {
        const mr = await call("POST", `/notifications/${first.id}/read`, aToken);
        check("mark one read 200", mr.status === 200 && mr.j?.data?.isRead === true);
    }
    const all = await call("POST", "/notifications/read-all", aToken);
    check("mark all read", all.status === 200 && typeof all.j?.data?.updated === "number");
    const noAuth = await call("GET", "/notifications", null);
    check("no-auth 401", noAuth.status === 401);
}

console.log("\n=== BENEFICIARIES ===");
{
    const bad = await call("POST", "/beneficiaries", aToken, { identifier: B.email });
    check("create via email resolves", bad.status === 201 && bad.j?.data?.handle === B.username);
    const list = await call("GET", "/beneficiaries", aToken);
    check("list 200 + array", list.status === 200 && Array.isArray(list.j?.data) && list.j.data.length === 1);
    const b0 = list.j?.data?.[0];
    const upd = await call("PUT", `/beneficiaries/${b0.id}`, aToken, { isFavorite: true, nickname: "Bestie" });
    check("update favorite+nickname", upd.status === 200 && upd.j?.data?.isFavorite === true && upd.j?.data?.nickname === "Bestie");
    const dup = await call("POST", "/beneficiaries", aToken, { identifier: B.email, nickname: "Again" });
    check("duplicate upsert idempotent", dup.status === 201);
    const other = await call("DELETE", `/beneficiaries/${b0.id}`, bToken);
    check("stranger delete 404", other.status === 404);
    const del = await call("DELETE", `/beneficiaries/${b0.id}`, aToken);
    check("owner delete 200", del.status === 200 && del.j?.data?.deleted === true);
    const after = await call("GET", "/beneficiaries", aToken);
    check("empty after delete", after.j?.data?.length === 0);
}

console.log("\n=== PAYMENT REQUESTS ===");
{
    const created = await call("POST", "/requests", bToken, { to: A.username, amount: 250, note: "Lunch split" });
    check("create 201", created.status === 201 && created.j?.data?.direction === "OUTGOING");
    const reqId = created.j?.data?.id;
    check("reference NEXA-REQ", String(created.j?.data?.reference || "").startsWith("NEXA-REQ"));
    const received = await call("GET", "/requests", aToken);
    check("receiver sees INCOMING", received.j?.data?.some((r) => r.id === reqId && r.direction === "INCOMING"));
    const sent = await call("GET", "/requests?box=sent", bToken);
    check("sender sees OUTGOING", sent.j?.data?.some((r) => r.id === reqId && r.direction === "OUTGOING"));
    const strangerCancel = await call("POST", `/requests/${reqId}/cancel`, aToken, {});
    check("receiver cannot cancel (403)", strangerCancel.status === 403);
    const accept = await call("POST", `/requests/${reqId}/accept`, aToken, {});
    check("accept 200 + paid", accept.status === 200 && (accept.j?.data?.status === "ACCEPTED" || accept.j?.data?.transactionStatus === "COMPLETED"));
    check("accept returns risk", typeof accept.j?.data?.risk === "object");
    const again = await call("POST", `/requests/${reqId}/accept`, aToken, {});
    check("re-accept blocked 400", again.status === 400);
    // Reject path
    const r2 = await call("POST", "/requests", bToken, { to: A.username, amount: 100 });
    const rej = await call("POST", `/requests/${r2.j?.data?.id}/reject`, aToken, {});
    check("reject 200", rej.status === 200 && rej.j?.data?.status === "REJECTED");
    // Validation
    const badAmount = await call("POST", "/requests", bToken, { to: A.username, amount: 0 });
    check("amount 0 -> 422", badAmount.status === 422);
    const badAction = await call("POST", "/requests", bToken, { to: A.username, amount: 100 });
    const badAct = await call("POST", `/requests/${badAction.j?.data?.id}/bogus`, bToken, {});
    check("bogus action -> 422", badAct.status === 422);
    const cancel = await call("POST", `/requests/${badAction.j?.data?.id}/cancel`, bToken, {});
    check("sender cancel 200", cancel.status === 200 && cancel.j?.data?.status === "CANCELLED");
}

console.log("\n=== RECURRING PAYMENTS ===");
{
    const created = await call("POST", "/recurring-payments", aToken, { to: B.username, amount: 500, frequency: "MONTHLY", note: "Rent" });
    check("create 201", created.status === 201 && created.j?.data?.frequencyLabel === "monthly");
    const rid = created.j?.data?.id;
    const list = await call("GET", "/recurring-payments", aToken);
    check("list has entry", list.j?.data?.some((r) => r.id === rid));
    const paused = await call("POST", `/recurring-payments/${rid}/pause`, aToken);
    check("pause 200", paused.status === 200 && paused.j?.data?.status === "PAUSED");
    const pausedAgain = await call("POST", `/recurring-payments/${rid}/pause`, aToken);
    check("re-pause 400", pausedAgain.status === 400);
    const resumed = await call("POST", `/recurring-payments/${rid}/resume`, aToken);
    check("resume 200", resumed.status === 200 && resumed.j?.data?.status === "ACTIVE");
    const del = await call("DELETE", `/recurring-payments/${rid}`, aToken);
    check("delete 200", del.status === 200 && del.j?.data?.deleted === true);
    const biweekly = await call("POST", "/recurring-payments", aToken, { to: B.username, amount: 100, frequency: "BIWEEKLY" });
    check("biweekly mapped to WEEKLY", biweekly.status === 201 && biweekly.j?.data?.frequency === "WEEKLY");
    await call("DELETE", `/recurring-payments/${biweekly.j?.data?.id}`, aToken);
    const badFreq = await call("POST", "/recurring-payments", aToken, { to: B.username, amount: 100, frequency: "HOURLY" });
    check("bad frequency 422", badFreq.status === 422);
}

console.log("\n=== NEGATIVES ===");
{
    const noAuth = await call("POST", "/requests", null, { to: B.username, amount: 100 });
    check("no-auth create request 401", noAuth.status === 401);
    const selfReq = await call("POST", "/requests", aToken, { to: A.username, amount: 100 });
    check("self request 400", selfReq.status === 400);
    const otherDel = await call("DELETE", "/recurring-payments/nonexistent-id", aToken);
    check("missing recurring 404", otherDel.status === 404);
}

console.log(failures === 0 ? "\nALL PHASE 11a CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);