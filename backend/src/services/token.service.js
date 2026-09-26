import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * NEXA Wallet — JWT token service.
 * Issues short-lived access tokens and rotating refresh tokens.
 * Session identity (`sid`) binds every token to a UserSession row.
 */

function parseTtl(ttl, fallbackMs) {
    if (typeof ttl === "number") return ttl;
    const m = /^(\d+)\s*([smhd])$/i.exec(String(ttl || "").trim());
    if (!m) return fallbackMs;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    return n * mult;
}

export const ACCESS_TTL_MS = parseTtl(env.jwt.accessTtl, 15 * 60_000);
export const REFRESH_TTL_MS = parseTtl(env.jwt.refreshTtl, 7 * 86_400_000);

function expiresInSeconds(ms) {
    return Math.max(60, Math.floor(ms / 1000));
}

/** Short-lived token for API calls. Payload: { sub, role, sid, type:"access" } */
export function signAccessToken({ userId, role, sessionId }) {
    return jwt.sign(
        { sub: userId, role, sid: sessionId, type: "access" },
        env.jwt.accessSecret,
        { expiresIn: expiresInSeconds(ACCESS_TTL_MS) }
    );
}

/** Long-lived token used only at /auth/refresh. Payload: { sub, sid, type:"refresh" } */
export function signRefreshToken({ userId, sessionId }) {
    return jwt.sign(
        { sub: userId, sid: sessionId, type: "refresh" },
        env.jwt.refreshSecret,
        { expiresIn: expiresInSeconds(REFRESH_TTL_MS) }
    );
}

export function verifyRefreshToken(token) {
    const payload = jwt.verify(token, env.jwt.refreshSecret);
    if (payload.type !== "refresh") throw new Error("Not a refresh token");
    return payload; // { sub, sid, iat, exp }
}

export function cookieOptions(maxAgeMs) {
    return {
        httpOnly: true,
        secure: env.isProd,
        sameSite: "lax",
        path: "/",
        maxAge: maxAgeMs,
    };
}

export const ACCESS_COOKIE = "nexa_access";
export const REFRESH_COOKIE = "nexa_refresh";

export default {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    cookieOptions,
    ACCESS_TTL_MS,
    REFRESH_TTL_MS,
    ACCESS_COOKIE,
    REFRESH_COOKIE,
};
