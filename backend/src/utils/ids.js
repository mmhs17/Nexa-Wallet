import crypto from "node:crypto";

/**
 * NEXA Wallet — human-readable identifier generators.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function randomChars(length) {
    let out = "";
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i += 1) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}

/** NEXA Wallet ID, e.g. NEXA-4F2A9 */
export function generateNexaId() {
    return "NEXA-" + randomChars(5);
}

/** Transaction reference, e.g. NEXA-TXN-2026-8F42A91 */
export function generateTransactionReference(date = new Date()) {
    const year = date.getFullYear();
    return "NEXA-TXN-" + year + "-" + randomChars(7);
}

/** Payment request reference, e.g. NEXA-REQ-2026-3K9D2A1 */
export function generateRequestReference(date = new Date()) {
    const year = date.getFullYear();
    return "NEXA-REQ-" + year + "-" + randomChars(7);
}

/** Short device identifier. */
export function generateDeviceId() {
    return "dev_" + randomChars(12).toLowerCase();
}

export default {
    generateNexaId,
    generateTransactionReference,
    generateRequestReference,
    generateDeviceId,
};
