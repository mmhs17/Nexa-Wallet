import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * NEXA Wallet — cryptographic helpers.
 * - AES-256-GCM encryption for secrets at rest (e.g. TOTP secrets).
 * - Secure random token generation and hashing.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM

function getKey() {
    const raw = env.encryptionKey || "";
    // Accept a 64-char hex key (32 bytes) or derive one from any string.
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, "hex");
    }
    return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a UTF-8 string. Returns "iv:tag:ciphertext" (all base64).
 */
export function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(String(plaintext), "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a value produced by encrypt(). Returns null on failure.
 */
export function decrypt(payload) {
    if (!payload) return null;
    try {
        const [ivB64, tagB64, dataB64] = String(payload).split(":");
        if (!ivB64 || !tagB64 || !dataB64) return null;
        const decipher = crypto.createDecipheriv(
            ALGO,
            getKey(),
            Buffer.from(ivB64, "base64")
        );
        decipher.setAuthTag(Buffer.from(tagB64, "base64"));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(dataB64, "base64")),
            decipher.final(),
        ]);
        return decrypted.toString("utf8");
    } catch {
        return null;
    }
}

/** Generate a URL-safe random token (default 32 bytes). */
export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}

/** SHA-256 hash of a token, hex encoded. Used to store session tokens safely. */
export function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

export default { encrypt, decrypt, randomToken, hashToken, safeEqual };