import prisma from "../config/prisma.js";
import argon2 from "argon2";
import { BadRequestError, ForbiddenError, NotFoundError, TxPinError } from "../utils/errors.js";
import { audit } from "./audit.service.js";
import { recordSecurityEvent, notify } from "./security.service.js";

/**
 * NEXA Wallet — Transaction Security Key (4-digit TX PIN).
 *
 * A short, frequently-typed second factor for outgoing money movement,
 * separate from the login password. Stored only as an argon2 hash.
 *
 * Brute-force resistance: wrong entries are throttled in-process
 * (5 wrong entries -> 10 minute lock).
 */

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

/** userId -> { count, until } */
const attempts = new Map();

function validatePinShape(pin) {
    const s = String(pin ?? "").trim();
    if (!/^\d{4}$/.test(s)) {
        throw new BadRequestError("Security key must be exactly 4 digits");
    }
    if (/^(\d)\1{3}$/.test(s)) {
        throw new BadRequestError("Security key cannot repeat the same digit four times (e.g. 1111)");
    }
    if (["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"].includes(s)) {
        throw new BadRequestError("Security key cannot be a sequential run of digits");
    }
    return s;
}

function assertNotLocked(userId) {
    const rec = attempts.get(userId);
    if (rec?.until && rec.until > Date.now()) {
        const mins = Math.ceil((rec.until - Date.now()) / 60000);
        throw new ForbiddenError(`Too many wrong security key attempts. Try again in ${mins} minute(s).`);
    }
    if (rec?.until && rec.until <= Date.now()) attempts.delete(userId);
}

function registerFailure(userId) {
    const rec = attempts.get(userId) || { count: 0, until: 0 };
    rec.count += 1;
    let justLocked = false;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.count = 0;
        rec.until = Date.now() + LOCK_MINUTES * 60 * 1000;
        justLocked = true;
    }
    attempts.set(userId, rec);
    // `justLocked` matters: rec.count is reset to 0 on the locking attempt, so
    // deriving "attempts left" from rec alone would wrongly report MAX_ATTEMPTS.
    return { rec, justLocked };
}

async function loadPin(userId) {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { txPinHash: true, txPinSetAt: true },
    });
    return { hash: u?.txPinHash || null, setAt: u?.txPinSetAt || null };
}

/** Status for the Security Center / send flow. Never leaks the PIN. */
export async function getTxPinStatus(userId) {
    const { setAt } = await loadPin(userId);
    const rec = attempts.get(userId);
    return {
        enabled: Boolean(setAt),
        setAt,
        locked: Boolean(rec?.until && rec.until > Date.now()),
        unlockInMinutes: rec?.until > Date.now() ? Math.ceil((rec.until - Date.now()) / 60000) : 0,
        maxAttempts: MAX_ATTEMPTS,
    };
}

/** Create or replace the 4-digit security key. Requires the account password. */
export async function setTxPin(userId, pin, password, client = {}) {
    const value = validatePinShape(pin);
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, txPinHash: true },
    });
    if (!user) throw new NotFoundError("User not found");
    const ok = await argon2.verify(user.passwordHash, String(password || ""));
    if (!ok) {
        await audit({
            userId, actorRole: "USER", action: "TX_PIN_SET", entity: "User",
            entityId: userId, result: "FAILURE", ipAddress: client.ip || null,
            metadata: { reason: "bad password" },
        });
        // NOTE: the session token is still valid here, so this must not be a
        // 401 — that would make the client refresh the token and replay the
        // request. Password confirmation failures are 403.
        throw new ForbiddenError("Incorrect account password");
    }
    const hash = await argon2.hash(value);
    const updated = await prisma.user.update({
        where: { id: userId },
        data: { txPinHash: hash, txPinSetAt: new Date() },
        select: { txPinSetAt: true },
    });
    attempts.delete(userId);
    await recordSecurityEvent(userId, {
        type: "TX_PIN_SET", severity: "WARNING",
        message: user.txPinHash ? "Transaction security key changed." : "Transaction security key enabled.",
        ipAddress: client.ip || null,
    });
    await notify(userId, {
        type: "TX_PIN_SET",
        title: user.txPinHash ? "Security key changed" : "Security key enabled",
        message: "Outgoing payments now require your 4-digit NEXA security key.",
    });
    await audit({
        userId, actorRole: "USER", action: "TX_PIN_SET", entity: "User",
        entityId: userId, result: "SUCCESS", ipAddress: client.ip || null,
    });
    return { enabled: true, setAt: updated.txPinSetAt };
}

/** Remove the security key. Requires the account password. */
export async function clearTxPin(userId, password, client = {}) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, txPinHash: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (!user.txPinHash) throw new BadRequestError("No security key is set");
    const ok = await argon2.verify(user.passwordHash, String(password || ""));
    if (!ok) throw new ForbiddenError("Incorrect account password");
    await prisma.user.update({
        where: { id: userId },
        data: { txPinHash: null, txPinSetAt: null },
    });
    attempts.delete(userId);
    await recordSecurityEvent(userId, {
        type: "TX_PIN_REMOVED", severity: "WARNING",
        message: "Transaction security key removed.",
        ipAddress: client.ip || null,
    });
    await audit({
        userId, actorRole: "USER", action: "TX_PIN_REMOVED", entity: "User",
        entityId: userId, result: "SUCCESS", ipAddress: client.ip || null,
    });
    return { enabled: false };
}

/**
 * Verify a PIN for a money movement. No-ops when the user has no key yet
 * so existing flows are not broken until they opt in.
 */
export async function assertTxPin(userId, pin) {
    const { hash } = await loadPin(userId);
    if (!hash) return { required: false, verified: false };

    assertNotLocked(userId);
    const ok = await argon2.verify(hash, String(pin ?? "").trim());
    if (!ok) {
        const { rec, justLocked } = registerFailure(userId);
        // Mirror assertNotLocked exactly (403 + same wording) so the attempt
        // that locks you out and every attempt after it are indistinguishable
        // to the client.
        if (justLocked) {
            throw new ForbiddenError(
                `Too many wrong security key attempts. Try again in ${LOCK_MINUTES} minute(s).`
            );
        }
        const left = Math.max(0, MAX_ATTEMPTS - rec.count);
        throw new TxPinError(`Incorrect security key. ${left} attempt(s) left.`);
    }
    attempts.delete(userId);
    return { required: true, verified: true };
}

export default { getTxPinStatus, setTxPin, clearTxPin, assertTxPin, PIN_LENGTH };

