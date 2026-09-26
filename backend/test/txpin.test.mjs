/**
 * NEXA Wallet - transaction security key (TX PIN) integration tests.
 *
 * Runs against a live backend with a seeded database:
 *     cd backend && npm run dev        # API on :4000
 *     npm run db:seed                 # demo accounts, password Test@1234
 *     npm test
 *
 * If the API is not reachable the whole suite SKIPS rather than reporting
 * failures, so `npm test` stays usable without a running server.
 *
 * The brute-force test deliberately uses a dedicated account (LOCKOUT_USER)
 * because the attempt counter lives in-process on the backend and a lockout
 * cannot be cleared by the test -- only by restarting the server.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.NEXA_API_URL || "http://localhost:4000/api";
const PASSWORD = "Test@1234";
const PIN = "8472";        // 4 digits, not repeated, not a sequential run
const HAPPY_USER = "friend1";
const LOCKOUT_USER = "phase5main";

async function call(method, path, { token, body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
}

const login = async (identifier) => {
    const r = await call("POST", "/auth/login", { body: { identifier, password: PASSWORD } });
    return r.json?.data?.accessToken || null;
};

/**
 * Tokens are cached per account: the auth endpoint allows only 30 logins
 * per 15 minutes per IP, so logging in once per test would rate-limit the
 * suite into a cascade of misleading 401s.
 */
const tokens = new Map();
async function tokenFor(identifier) {
    if (!tokens.has(identifier)) {
        const t = await login(identifier);
        assert.ok(
            t,
            `could not log in as "${identifier}" - check that "npm run db:seed" has been run. ` +
            `If this is RATE_LIMITED, the auth limiter allows only 30 logins per 15 minutes; wait and retry.`
        );
        tokens.set(identifier, t);
    }
    return tokens.get(identifier);
}

const keyStatus = (token) => call("GET", "/security/tx-pin", { token });
const setKey = (token, pin, password = PASSWORD) =>
    call("POST", "/security/tx-pin", { token, body: { pin, password } });
const clearKey = (token, password = PASSWORD) =>
    call("DELETE", "/security/tx-pin", { token, body: { password } });
const send = (token, body) => call("POST", "/wallet/send", { token, body });

/**
 * `POST /wallet/send` is behind paymentLimiter (20 money movements/min per IP).
 * The whole suite shares one IP, so a run that immediately follows a previous
 * one lands inside the same fixed 60s window and sees 429s that have nothing to
 * do with the security key. paymentLimiter is a fixed window (not a token
 * bucket), so polling past 60s is guaranteed to cross the boundary; retry
 * often enough that we never sit on a boundary edge.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sendWithBudget(token, body, { tries = 6, gapMs = 15000 } = {}) {
    let res = await send(token, body);
    for (let i = 0; res.status === 429 && i < tries - 1; i++) {
        await sleep(gapMs);
        res = await send(token, body);
    }
    assert.notEqual(
        res.status,
        429,
        "payment rate limit (20/min/IP) still exhausted after waiting ~75s - " +
            "re-run after the window clears: " + JSON.stringify(res.json)
    );
    return res;
}

/** Resolve a second account to pay, so a send is possible. */
const resolvePeer = async (token) => {
    for (const q of ["phase4other", "phase4test", "friend2"]) {
        const r = await call("GET", `/wallet/recipients/resolve?q=${encodeURIComponent(q)}`, { token });
        const username = r.json?.data?.username;
        if (username) return username;
    }
    return null;
};

/**
 * Preflight: is the API up AND is there enough rate-limit budget left to
 * actually run the suite?
 *
 * `/api/health` sits behind the global apiLimiter (300 req / 15 min / IP), and
 * so is every endpoint these tests touch. A run that follows earlier runs can
 * therefore find the whole budget already spent, in which case every test would
 * fail with a 429 that has nothing to do with the security key. Detect that up
 * front and skip the suite with one honest message instead of a wall of reds.
 */
const PREFLIGHT = await (async () => {
    try {
        const r = await call("GET", "/health");
        if (r.status === 429) return { up: true, throttled: true };
        if (r.status !== 200) return { up: false };
        return { up: true, throttled: false };
    } catch {
        return { up: false };
    }
})();

const API_UP = PREFLIGHT.up;

const SKIP = !API_UP
    ? `API not reachable at ${BASE} - start it with "npm run dev" in backend/ and run "npm run db:seed"`
    : PREFLIGHT.throttled
      ? `rate limited (global apiLimiter: 300 req / 15 min per IP) - the budget is spent, ` +
        `so every test would fail with 429 regardless of the security key. ` +
        `Wait ~15 min for the window to reset, then re-run.`
      : false;

if (SKIP) {
    console.log(`# txpin: skipping - ${SKIP}`);
}


/* ------------------------------------------------------------------ *
 * Lifecycle: status -> send without a key -> set -> verify -> remove
 * ------------------------------------------------------------------ */

test("security key is off by default and never leaks the hash", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);

    if ((await keyStatus(token)).json?.data?.enabled) {
        await clearKey(token);
    }

    const res = await keyStatus(token);
    assert.equal(res.status, 200);
    assert.equal(res.json.data.enabled, false);
    assert.equal(res.json.data.locked, false);
    assert.ok(!("txPinHash" in res.json.data), "response must not contain a hash field");
});

test("payments work with no key set, and report txPinVerified=false", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);

    const to = await resolvePeer(token);
    assert.ok(to, "no peer account available to pay");

    const res = await send(token, { to, amount: 1, note: "txpin: no-key regression" });
    assert.ok([200, 201].includes(res.status), `expected success, got ${res.status}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.data.txPinVerified, false);
});

test("setting the key requires the correct account password", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);

    const wrong = await setKey(token, PIN, "DefinitelyWrong1");
    assert.equal(wrong.status, 403, "bad password must be 403");
    assert.notEqual(wrong.status, 401, "401 would trigger a client token refresh + payment replay");
    assert.equal((await keyStatus(token)).json.data.enabled, false, "key must not be set after a bad password");

    const good = await setKey(token, PIN);
    assert.ok([200, 201].includes(good.status), `expected set to succeed, got ${good.status}: ${JSON.stringify(good.json)}`);
    assert.equal(good.json.data.enabled, true);

    await clearKey(token);
});

test("weak keys are rejected by shape validation", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);

    // Shape is rejected in one of two layers, and both are correct:
    //   422 - the validate() wrapper, for anything failing /^\d{4}$/
    //          ("123", "12345", "abcd", "")
    //   400 - the service's own guard, for 4-digit values the regex accepts
    //          but policy forbids ("1111" repeats, "1234" runs)
    // What matters for the client contract: rejected, never 401, never stored.
    const expected = { "123": 422, "12345": 422, abcd: 422, "": 422, "1111": 400, "1234": 400 };
    for (const [bad, want] of Object.entries(expected)) {
        const res = await setKey(token, bad);
        assert.equal(res.status, want, `key "${bad}": expected ${want}, got ${res.status}: ${JSON.stringify(res.json)}`);
        assert.notEqual(res.status, 401, `key "${bad}" returned 401 (would trigger a client token refresh)`);
    }
    // A rejected key must never be stored.
    assert.equal((await keyStatus(token)).json.data.enabled, false);
});


/* ------------------------------------------------------------------ *
 * Enforcement once a key exists
 *
 * The status code matters as much as the outcome: a wrong key must NOT
 * be 401, because the Axios interceptor treats 401 as an expired session
 * and silently replays the request (double-charging the attempt counter
 * and potentially logging the user out mid-payment).
 * ------------------------------------------------------------------ */

test("sending without a key is refused with 422 TX_PIN_INVALID, never 401", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);
    await setKey(token, PIN);

    const to = await resolvePeer(token);
    assert.ok(to, "no peer account available to pay");

    const res = await send(token, { to, amount: 1 });
    assert.notEqual(res.status, 401, "401 would make the client refresh the token and replay the payment");
    assert.equal(res.status, 422, `expected 422, got ${res.status}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.error.code, "TX_PIN_INVALID");
    assert.match(res.json.error.message, /security key/i);

    await clearKey(token);
});

test("a wrong key is refused, never 401, and counts toward the limit", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);
    await setKey(token, PIN);

    const to = await resolvePeer(token);
    const res = await send(token, { to, amount: 1, pin: "0001" });

    assert.notEqual(res.status, 401, "401 would make the client refresh the token and replay the payment");
    assert.equal(res.status, 422, `expected 422, got ${res.status}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.error.code, "TX_PIN_INVALID");
    assert.match(res.json.error.message, /attempt/i, "message should say how many attempts remain");
    assert.match(res.json.error.message, /4 attempt\(s\) left/);

    await clearKey(token);
});

test("the correct key authorises the payment and is reported as verified", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);
    await setKey(token, PIN);

    const to = await resolvePeer(token);
    const res = await send(token, { to, amount: 1, pin: PIN });

    assert.ok([200, 201].includes(res.status), `expected success, got ${res.status}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.data.txPinVerified, true);

    const st = await keyStatus(token);
    assert.equal(st.json.data.enabled, true);
    assert.equal(st.json.data.locked, false, "a success must clear the failed-attempt counter");

    await clearKey(token);
});

test("removing the key requires the password and restores the unverified flow", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);
    await setKey(token, PIN);

    const denied = await clearKey(token, "DefinitelyWrong1");
    assert.equal(denied.status, 403, "bad password must be 403");
    assert.notEqual(denied.status, 401, "401 would trigger a client token refresh + replay");
    assert.equal((await keyStatus(token)).json.data.enabled, true, "key must survive a bad password");
});

test("clearing the key restores plain sending", { skip: SKIP }, async () => {
    const token = await tokenFor(HAPPY_USER);
    if (!(await keyStatus(token)).json?.data?.enabled) await setKey(token, PIN);

    const removed = await clearKey(token);
    assert.equal(removed.status, 200, `expected 200, got ${removed.status}: ${JSON.stringify(removed.json)}`);
    assert.equal((await keyStatus(token)).json.data.enabled, false);

    const to = await resolvePeer(token);
    const res = await send(token, { to, amount: 1 });
    assert.ok([200, 201].includes(res.status), "sending should work again with no key");
    assert.equal(res.json.data.txPinVerified, false);
});


/* ------------------------------------------------------------------ *
 * Brute-force lockout - uses its own account.
 *
 * A lockout is held in the backend's in-process attempt map, so it can
 * only be cleared by restarting the server. Running this on HAPPY_USER
 * would break every other test in the file.
 * ------------------------------------------------------------------ */

test("five wrong keys lock the account out for 10 minutes", { skip: SKIP }, async () => {
    const token = await tokenFor(LOCKOUT_USER);

    if ((await keyStatus(token)).json?.data?.enabled) await clearKey(token);
    const set = await setKey(token, PIN);
    assert.ok([200, 201].includes(set.status), `could not enable key: ${JSON.stringify(set.json)}`);

    const to = await resolvePeer(token) || LOCKOUT_USER;

    // Attempts 1-4 stay retryable: 422 with an accurate countdown.
    for (let i = 1; i <= 4; i++) {
        const res = await sendWithBudget(token, { to, amount: 1, pin: "0001" });
        assert.notEqual(res.status, 401, `attempt ${i} returned 401`);
        assert.equal(res.status, 422, `attempt ${i}: expected 422, got ${res.status}`);
        assert.match(res.json.error.message, new RegExp(`${5 - i} attempt\\(s\\) left`));
    }

    // Attempt 5 trips the lock. It must not also claim attempts remain.
    const fifth = await sendWithBudget(token, { to, amount: 1, pin: "0001" });
    assert.notEqual(fifth.status, 401, "attempt 5 returned 401");
    assert.equal(fifth.status, 403, `attempt 5: expected 403 lockout, got ${fifth.status}`);
    assert.match(fifth.json.error.message, /too many/i);
    assert.doesNotMatch(fifth.json.error.message, /attempt\(s\) left/i);

    const st = await keyStatus(token);
    assert.equal(st.json.data.locked, true, "status should report locked");
    assert.ok(
        st.json.data.unlockInMinutes > 5 && st.json.data.unlockInMinutes <= 10,
        `expected ~10 minutes, got ${st.json.data.unlockInMinutes}`
    );
    assert.equal(st.json.data.enabled, true, "the key itself must stay set during lockout");

    // Even the CORRECT key must be refused while the lockout is active.
    const correct = await sendWithBudget(token, { to, amount: 1, pin: PIN });
    assert.notEqual(correct.status, 401, "lockout response returned 401");
    assert.ok(
        ![200, 201].includes(correct.status),
        "the correct key must not authorise a payment during lockout"
    );
    assert.match(correct.json.error.message, /too many/i);

    // Clean up so a re-run is meaningful; the lockout itself needs a restart.
    await clearKey(token);
});
