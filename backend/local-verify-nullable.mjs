/**
 * Verify nullable optional-body handling on the extras routes:
 * null must be accepted (not 422) and must not be persisted as "null".
 */
const BASE = "http://localhost:4000/api";

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

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const login = await call("POST", "/auth/login", null, { identifier: "friend1", password: "Test@1234" });
const token = login.json.data.accessToken;

/* 1. beneficiary with explicit nulls */
const peer = "phase4test";
const b = await call("POST", "/beneficiaries", token, { identifier: peer, nickname: null, isFavorite: null });
check("POST /beneficiaries with nickname:null, isFavorite:null -> not 422", b.status !== 422, `got ${b.status} ${JSON.stringify(b.json?.error)}`);
if (b.ok) {
    check("nickname fell back to displayName (not \"null\")", b.json.data.nickname !== "null" && b.json.data.nickname === b.json.data.displayName, `nickname=${JSON.stringify(b.json.data.nickname)} displayName=${JSON.stringify(b.json.data.displayName)}`);
    check("isFavorite coerced to false", b.json.data.isFavorite === false);

    /* update with null nickname -> reset to displayName */
    const u = await call("PUT", `/beneficiaries/${b.json.data.id}`, token, { nickname: null });
    check("PUT /beneficiaries/:id with nickname:null -> 200", u.status === 200, `got ${u.status}`);
    check("updated nickname is not the string \"null\"", u.json?.data?.nickname !== "null", `nickname=${JSON.stringify(u.json?.data?.nickname)}`);

    const d = await call("DELETE", `/beneficiaries/${b.json.data.id}`, token);
    check("cleanup DELETE beneficiary", d.status === 200);
}

/* 2. recurring payment with null frequency -> defaults to MONTHLY */
const rec = await call("POST", "/recurring-payments", token, { to: peer, amount: 111, frequency: null, note: null });
check("POST /recurring-payments with frequency:null, note:null -> 201", rec.status === 201, `got ${rec.status} ${JSON.stringify(rec.json?.error)}`);
if (rec.ok) {
    check("frequency defaulted to MONTHLY", rec.json.data.frequency === "MONTHLY", `frequency=${rec.json.data.frequency}`);
    check("note is null (not \"null\")", rec.json.data.note === null, `note=${JSON.stringify(rec.json.data.note)}`);
    await call("DELETE", `/recurring-payments/${rec.json.data.id}`, token);
}

/* 3. request with null note */
const req = await call("POST", "/requests", token, { to: peer, amount: 99, note: null });
check("POST /requests with note:null -> 201", req.status === 201, `got ${req.status} ${JSON.stringify(req.json?.error)}`);
if (req.ok) {
    check("request note is null (not \"null\")", req.json.data.note === null, `note=${JSON.stringify(req.json.data.note)}`);
    await call("POST", `/requests/${req.json.data.id}/cancel`, token, {});
}

/* 4. regression: still rejects genuinely bad input */
const badFreq = await call("POST", "/recurring-payments", token, { to: peer, amount: 100, frequency: "HOURLY" });
check("rejects invalid frequency HOURLY -> 422", badFreq.status === 422, `got ${badFreq.status}`);
const badAmount = await call("POST", "/requests", token, { to: peer, amount: 0 });
check("rejects amount 0 -> 422", badAmount.status === 422, `got ${badAmount.status}`);
const selfReq = await call("POST", "/requests", token, { to: "friend1", amount: 100 });
check("rejects self-request -> 400", selfReq.status === 400, `got ${selfReq.status}`);
const noAuth = await call("GET", "/beneficiaries", null);
check("rejects unauthenticated -> 401", noAuth.status === 401, `got ${noAuth.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
