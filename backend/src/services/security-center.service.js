import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import { audit } from "./audit.service.js";
import { recordSecurityEvent } from "./security.service.js";
import { getStatus as getTwoFaStatus } from "./twoFactor.service.js";
import { listActiveSessions, revokeSession, revokeAllSessions } from "./session.service.js";
import { UNLOCK_COOLDOWN_MINUTES } from "../config/constants.js";

/**
 * NEXA Wallet — Security Center service (Phase 7).
 * One composite overview (with an explainable security posture score),
 * the security-event timeline, and device-session management.
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const ALLOWED_SEVERITIES = ["INFO", "WARNING", "CRITICAL"];

/** Every enum value from SecurityEventType — kept in step with Prisma schema. */
const ALLOWED_EVENT_TYPES = Object.freeze([
    "LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET",
    "TWO_FA_ENABLED", "TWO_FA_DISABLED", "TWO_FA_VERIFIED", "NEW_DEVICE", "SUSPICIOUS_LOGIN",
    "WALLET_FROZEN", "WALLET_UNFROZEN", "PAYMENT_BLOCKED", "PAYMENT_VERIFIED",
    "SESSION_REVOKED", "ACCOUNT_LOCKED", "RECOVERY_CODE_USED",
]);

function parsePage(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.pageSize ?? query.limit, 10) || PAGE_SIZE_DEFAULT));
    return { page, pageSize };
}

/**
 * Explainable security posture — mirrors the Phase 5 factor style.
 * 2FA 30, verified email 15, no OPEN fraud alerts 20, no failed logins
 * in the last 24h 20, wallet not frozen 15. 100 = hardened.
 */
export function computePosture({ twoFa, emailVerified, openAlerts, failedLogins24h, walletStatus }) {
    const factors = [];
    const push = (code, points, detail) => factors.push({ code, points, detail });
    if (twoFa.enabled) push("TWO_FACTOR_ENABLED", 30, "Two-factor authentication is active");
    else push("TWO_FACTOR_MISSING", 0, "Two-factor authentication is not enabled");
    if (emailVerified) push("EMAIL_VERIFIED", 15, "Email address is verified");
    else push("EMAIL_UNVERIFIED", 0, "Email address is not verified");
    if (openAlerts === 0) push("NO_OPEN_FRAUD_ALERTS", 20, "No fraud alerts awaiting review");
    else push("OPEN_FRAUD_ALERTS", 0, `${openAlerts} fraud alert(s) awaiting review`);
    if (failedLogins24h === 0) push("NO_RECENT_LOGIN_FAILURES", 20, "No failed login attempts in the last 24 hours");
    else push("RECENT_LOGIN_FAILURES", 0, `${failedLogins24h} failed login attempt(s) in the last 24 hours`);
    if (walletStatus !== "FROZEN") push("WALLET_ACTIVE", 15, "Wallet is active (not frozen)");
    else push("WALLET_FROZEN", 0, "Wallet is currently locked");
    const score = factors.reduce((s, f) => s + f.points, 0);
    const level = score >= 75 ? "SECURE" : score >= 50 ? "FAIR" : "AT_RISK";
    return { score, maxScore: 100, level, factors };
}


/** Composite Security Center overview for the signed-in user. */
export async function getOverview(userId, currentSessionId = null) {
    const [twoFa, user, wallet, privacy, sessions, openAlerts, failedLogins24h, unreadAlerts] = await Promise.all([
        getTwoFaStatus(userId),
        prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, lastLoginAt: true } }),
        prisma.wallet.findUnique({ where: { userId }, select: { status: true, frozenAt: true, frozenReason: true } }),
        prisma.privacySettings.findUnique({ where: { userId }, select: { shieldActive: true } }),
        listActiveSessions(userId),
        prisma.fraudAlert.count({ where: { userId, status: "OPEN" } }),
        prisma.securityEvent.count({
            where: { userId, type: "LOGIN_FAILED", createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
        }),
        prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const posture = computePosture({
        twoFa,
        emailVerified: user?.emailVerified ?? false,
        openAlerts,
        failedLogins24h,
        walletStatus: wallet?.status ?? "ACTIVE",
    });
    return {
        posture,
        twoFactor: twoFa,
        emailVerified: user?.emailVerified ?? false,
        lastLoginAt: user?.lastLoginAt ?? null,
        walletLock: {
            status: wallet?.status ?? "ACTIVE",
            locked: wallet?.status === "FROZEN",
            frozenAt: wallet?.frozenAt ?? null,
            frozenReason: wallet?.frozenReason ?? null,
            unlockAvailableAt: wallet?.status === "FROZEN" && wallet.frozenAt
                ? new Date(wallet.frozenAt.getTime() + UNLOCK_COOLDOWN_MINUTES * 60 * 1000)
                : null,
        },
        privacyShield: { active: privacy?.shieldActive ?? false },
        sessions: {
            activeCount: sessions.length,
            current: currentSessionId
                ? (() => {
                      const c = sessions.find((s) => s.id === currentSessionId);
                      return c ? { ...c, isCurrent: true } : null;
                  })()
                : null,
            others: sessions.filter((s) => s.id !== currentSessionId),
        },
        fraudAlertsOpen: openAlerts,
        unreadNotifications: unreadAlerts,
    };
}

/** Paginated security-event timeline with optional type/severity filters. */
export async function listEvents(userId, query = {}) {
    const { page, pageSize } = parsePage(query);
    const where = { userId };
    if (query.type && ALLOWED_EVENT_TYPES.includes(String(query.type).toUpperCase())) {
        where.type = String(query.type).toUpperCase();
    }
    if (query.severity && ALLOWED_SEVERITIES.includes(String(query.severity).toUpperCase())) {
        where.severity = String(query.severity).toUpperCase();
    }
    if (query.since) {
        const d = new Date(query.since);
        if (!Number.isNaN(d.getTime())) where.createdAt = { ...(where.createdAt || {}), gte: d };
    }
    const [total, rows] = await Promise.all([
        prisma.securityEvent.count({ where }),
        prisma.securityEvent.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);
    return {
        items: rows.map((e) => ({
            id: e.id,
            type: e.type,
            severity: e.severity,
            message: e.message,
            deviceId: e.deviceId,
            ipAddress: e.ipAddress,
            createdAt: e.createdAt,
        })),
        page, pageSize, total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}


/** Active device sessions with the caller's session flagged. */
export async function listSessions(userId, currentSessionId = null) {
    const sessions = await listActiveSessions(userId);
    return {
        items: sessions.map((s) => ({
            id: s.id,
            deviceLabel: s.deviceLabel,
            deviceId: s.deviceId,
            ipAddress: s.ipAddress,
            isTrusted: s.isTrusted,
            lastActiveAt: s.lastActiveAt,
            createdAt: s.createdAt,
            isCurrent: currentSessionId ? s.id === currentSessionId : false,
        })),
        total: sessions.length,
    };
}

/** Revoke one of the user's sessions by id (ownership-checked). */
export async function revokeOneSession(userId, sessionId, client = {}) {
    if (!sessionId) throw new BadRequestError("sessionId is required");
    const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundError("Session not found");
    if (session.revoked) throw new BadRequestError("Session is already revoked");
    await revokeSession(sessionId);
    const wasCurrent = client.currentSessionId === sessionId;
    await recordSecurityEvent(userId, {
        type: "SESSION_REVOKED",
        severity: wasCurrent ? "WARNING" : "INFO",
        message: wasCurrent ? "Current device session signed out." : "A device session was signed out from Security Center.",
        deviceId: session.deviceId, ipAddress: client.ip || null,
    });
    await audit({
        userId, actorRole: "USER", action: "SESSION_REVOKED", entity: "UserSession",
        entityId: sessionId, result: "SUCCESS", ipAddress: client.ip || null,
    });
    return { revoked: true, sessionId, wasCurrent };
}

/** Sign out everywhere except the current device session. */
export async function revokeOtherSessions(userId, currentSessionId, client = {}) {
    const before = await listActiveSessions(userId);
    const others = before.filter((s) => s.id !== currentSessionId);
    await revokeAllSessions(userId, currentSessionId);
    await recordSecurityEvent(userId, {
        type: "SESSION_REVOKED", severity: "INFO",
        message: `Signed out ${others.length} other device session(s) from Security Center.`,
        ipAddress: client.ip || null,
    });
    await audit({
        userId, actorRole: "USER", action: "SESSIONS_REVOKED_ALL", entity: "UserSession",
        result: "SUCCESS", metadata: { count: others.length }, ipAddress: client.ip || null,
    });
    return { revoked: others.length, keptCurrent: true };
}

export default { getOverview, listEvents, listSessions, revokeOneSession, revokeOtherSessions };
