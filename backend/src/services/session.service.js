import prisma from "../config/prisma.js";
import { hashToken } from "../utils/crypto.js";
import { REFRESH_TTL_MS } from "./token.service.js";

/**
 * NEXA Wallet — session service.
 * One UserSession row per login; refresh-token rotation updates the
 * stored token hash on the same row so `sid` stays stable for the
 * lifetime of the device session.
 */

export function getClientInfo(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
        (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ||
        req.ip ||
        req.socket?.remoteAddress ||
        null;
    return {
        ip,
        userAgent: req.headers["user-agent"] || null,
        deviceId: req.headers["x-device-id"] || null,
        deviceLabel: req.headers["x-device-label"] || null,
    };
}

export async function createSession(userId, refreshToken, client = {}) {
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    return prisma.userSession.create({
        data: {
            userId,
            tokenHash: hashToken(refreshToken),
            deviceId: client.deviceId || undefined,
            deviceLabel: client.deviceLabel || undefined,
            userAgent: client.userAgent || undefined,
            ipAddress: client.ip || undefined,
            expiresAt,
        },
    });
}

export async function rotateSession(sessionId, newRefreshToken) {
    return prisma.userSession.update({
        where: { id: sessionId },
        data: {
            tokenHash: hashToken(newRefreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
            lastActiveAt: new Date(),
            revoked: false,
        },
    });
}

/** Validate a presented refresh token against its session row (rotation-safe). */
export async function findSessionForRefresh(sessionId, refreshToken) {
    const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.revoked) return null;
    if (session.expiresAt < new Date()) return null;
    if (session.tokenHash !== hashToken(refreshToken)) return null;
    return session;
}

export async function touchSession(sessionId, client = {}) {
    try {
        await prisma.userSession.update({
            where: { id: sessionId },
            data: {
                lastActiveAt: new Date(),
                ...(client.ip ? { ipAddress: client.ip } : {}),
                ...(client.userAgent ? { userAgent: client.userAgent } : {}),
            },
        });
    } catch {
        // Session may have been revoked concurrently — not fatal.
    }
}

export async function revokeSession(sessionId) {
    try {
        await prisma.userSession.update({ where: { id: sessionId }, data: { revoked: true } });
    } catch {
        // Already gone — idempotent logout.
    }
}

export async function revokeAllSessions(userId, exceptSessionId = null) {
    await prisma.userSession.updateMany({
        where: {
            userId,
            revoked: false,
            ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
        },
        data: { revoked: true },
    });
}

export async function listActiveSessions(userId) {
    return prisma.userSession.findMany({
        where: { userId, revoked: false, expiresAt: { gt: new Date() } },
        orderBy: { lastActiveAt: "desc" },
        select: {
            id: true,
            deviceId: true,
            deviceLabel: true,
            ipAddress: true,
            isTrusted: true,
            lastActiveAt: true,
            createdAt: true,
        },
    });
}

export default {
    getClientInfo,
    createSession,
    rotateSession,
    findSessionForRefresh,
    touchSession,
    revokeSession,
    revokeAllSessions,
    listActiveSessions,
};
