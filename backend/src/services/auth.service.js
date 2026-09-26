import argon2 from "argon2";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { DEFAULT_CATEGORIES } from "../config/constants.js";
import { generateNexaId } from "../utils/ids.js";
import { randomToken, hashToken } from "../utils/crypto.js";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
} from "../utils/errors.js";
import {
    signAccessToken,
    signRefreshToken,
    REFRESH_TTL_MS,
} from "./token.service.js";
import {
    createSession,
    rotateSession,
    findSessionForRefresh,
    revokeSession,
    revokeAllSessions,
    touchSession,
} from "./session.service.js";
import { audit } from "./audit.service.js";
import { recordSecurityEvent, notify } from "./security.service.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendNewDeviceNotice } from "./mail.service.js";

/**
 * NEXA Wallet — authentication service.
 * Registration, login (with lockout), session-bound JWT issuance/rotation,
 * email verification, password reset and password change.
 */

const MAX_ATTEMPTS = env.security.maxLoginAttempts;
const LOCK_MINUTES = env.security.accountLockMinutes;

function publicUser(user) {
    return {
        id: user.id,
        nexaId: user.nexaId,
        username: user.username,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
    };
}

async function issueTokens(user, sessionId) {
    const accessToken = signAccessToken({ userId: user.id, role: user.role, sessionId });
    const refreshToken = signRefreshToken({ userId: user.id, sessionId });
    return { accessToken, refreshToken };
}

function isLocked(user) {
    return user.lockedUntil && user.lockedUntil > new Date();
}

async function provisionNewAccount(user) {
    await prisma.wallet.create({ data: { userId: user.id } });
    await prisma.privacySettings.create({ data: { userId: user.id } });
    await prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({
            userId: user.id,
            name: c.name,
            slug: c.slug,
            icon: c.icon,
            color: c.color,
            isSystem: true,
        })),
        skipDuplicates: true,
    });
}

/* ------------------------------------------------------------------ */
/* Registration / verification                                         */
/* ------------------------------------------------------------------ */

export async function register({ username, email, phone, password, fullName }, client) {
    const existing = await prisma.user.findFirst({
        where: {
            OR: [
                { username: username.toLowerCase() },
                { email: email.toLowerCase() },
                ...(phone ? [{ phone }] : []),
            ],
        },
        select: { id: true, username: true, email: true, phone: true },
    });
    if (existing) {
        if (existing.username === username.toLowerCase()) {
            throw new ConflictError("Username is already taken");
        }
        if (existing.email === email.toLowerCase()) {
            throw new ConflictError("An account with this email already exists");
        }
        throw new ConflictError("An account with this phone number already exists");
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const emailVerifyToken = randomToken(32);

    const user = await prisma.user.create({
        data: {
            nexaId: generateNexaId(),
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            phone: phone || null,
            passwordHash,
            fullName,
            emailVerifyToken,
        },
    });

    await provisionNewAccount(user);
    await audit({
        userId: user.id,
        actorRole: user.role,
        action: "USER_REGISTER",
        entity: "User",
        entityId: user.id,
        result: "SUCCESS",
        metadata: { username: user.username },
        ipAddress: client?.ip || null,
    });

    await sendVerificationEmail({ to: user.email, name: user.fullName, token: emailVerifyToken });

    return {
        user: publicUser(user),
        emailVerifyToken,
    };
}

export async function verifyEmail(token) {
    if (!token) throw new BadRequestError("Verification token is required");
    const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } });
    if (!user) throw new NotFoundError("Invalid or expired verification token");

    const updated = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifyToken: null },
    });
    await audit({
        userId: user.id,
        actorRole: user.role,
        action: "EMAIL_VERIFY",
        entity: "User",
        entityId: user.id,
        result: "SUCCESS",
    });
    return publicUser(updated);
}

export async function resendVerification(email) {
    const user = await prisma.user.findUnique({
        where: { email: String(email || "").toLowerCase() },
    });
    if (!user || user.emailVerified) return { sent: true };
    const token = randomToken(32);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyToken: token } });
    await sendVerificationEmail({ to: user.email, name: user.fullName, token });
    return { sent: true };
}

/* ------------------------------------------------------------------ */
/* Login / refresh / logout                                            */
/* ------------------------------------------------------------------ */

/**
 * Step 1 of login: credential check.
 * Returns either { twoFactorRequired: true, pendingSessionId, user }
 * (TOTP enabled — finish via verify2FA) or a full session
 * { twoFactorRequired: false, user, sessionId, accessToken, refreshToken }.
 */
export async function login({ identifier, password }, client) {
    const id = String(identifier || "").toLowerCase();
    const user = await prisma.user.findFirst({
        where: { OR: [{ email: id }, { username: id }, { phone: identifier }] },
        include: { twoFactor: true },
    });

    if (!user) {
        await argon2.hash(password || "dummy").catch(() => {});
        throw new UnauthorizedError("Invalid credentials");
    }

    if (user.status === "SUSPENDED") throw new ForbiddenError("Account is suspended. Contact support.");
    if (user.status === "LOCKED" || isLocked(user)) {
        throw new ForbiddenError("Account is temporarily locked due to failed attempts. Try again later.");
    }

    let passwordOk = false;
    try {
        passwordOk = await argon2.verify(user.passwordHash, password || "");
    } catch {
        passwordOk = false;
    }

    if (!passwordOk) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const update = { failedLoginAttempts: attempts };
        let locked = false;
        if (attempts >= MAX_ATTEMPTS) {
            update.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
            locked = true;
        }
        await prisma.user.update({ where: { id: user.id }, data: update });
        await recordSecurityEvent(user.id, {
            type: locked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
            severity: locked ? "CRITICAL" : "WARNING",
            message: locked
                ? `Account locked after ${attempts} failed login attempts`
                : `Failed login attempt (${attempts}/${MAX_ATTEMPTS})`,
            deviceId: client?.deviceId || null,
            ipAddress: client?.ip || null,
        });
        await audit({
            userId: user.id,
            actorRole: user.role,
            action: "LOGIN_FAILED",
            entity: "User",
            entityId: user.id,
            result: locked ? "ACCOUNT_LOCKED" : "FAILURE",
            ipAddress: client?.ip || null,
        });
        throw new UnauthorizedError(
            locked
                ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`
                : "Invalid credentials"
        );
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // 2FA gate: create a REVOKED placeholder session; verify2FA activates it.
    if (user.twoFactor?.enabled) {
        const pending = await createSession(user.id, randomToken(48), client);
        await prisma.userSession.update({
            where: { id: pending.id },
            data: { revoked: true },
        });
        return {
            twoFactorRequired: true,
            pendingSessionId: pending.id,
            user: publicUser(user),
        };
    }

    return finishLogin(user, client);
}

/** Shared tail of login + verify2FA: mint session + tokens, emit events. */
export async function finishLogin(user, client, existingSessionId = null) {
    const seed = randomToken(48);
    let session = existingSessionId
        ? await prisma.userSession.findUnique({ where: { id: existingSessionId } })
        : await createSession(user.id, seed, client);
    if (!session || session.userId !== user.id) {
        session = await createSession(user.id, seed, client);
    }
    const { accessToken, refreshToken } = await issueTokens(user, session.id);
    session = await rotateSession(session.id, refreshToken);

    const newDevice = await checkNewDeviceAfterSession(user.id, session.id, client);
    await recordSecurityEvent(user.id, {
        type: "LOGIN_SUCCESS",
        severity: "INFO",
        message: newDevice ? "Login successful from a new device" : "Login successful",
        deviceId: client?.deviceId || null,
        ipAddress: client?.ip || null,
        metadata: newDevice ? { newDevice: true } : undefined,
    });
    if (newDevice) {
        await notify(user.id, {
            type: "NEW_DEVICE",
            title: "New device sign-in",
            message: `Your account was accessed from ${client?.deviceLabel || "a new device"}. If this was not you, freeze your wallet.`,
        });
        await sendNewDeviceNotice({
            to: user.email,
            name: user.fullName,
            deviceLabel: client?.deviceLabel,
            ip: client?.ip,
        });
    }
    await audit({
        userId: user.id,
        actorRole: user.role,
        action: "LOGIN_SUCCESS",
        entity: "User",
        entityId: user.id,
        result: "SUCCESS",
        metadata: { sessionId: session.id, newDevice },
        ipAddress: client?.ip || null,
    });

    return {
        twoFactorRequired: false,
        user: publicUser(user),
        sessionId: session.id,
        accessToken,
        refreshToken,
    };
}

async function checkNewDeviceAfterSession(userId, sessionId, client) {
    if (!client?.deviceId) return false;
    const count = await prisma.userSession.count({
        where: { userId, deviceId: client.deviceId, id: { not: sessionId } },
    });
    return count === 0;
}

export async function refresh(refreshToken) {
    if (!refreshToken) throw new UnauthorizedError("Refresh token is required");
    let payload;
    try {
        const mod = await import("./token.service.js");
        payload = mod.verifyRefreshToken(refreshToken);
    } catch {
        throw new UnauthorizedError("Invalid or expired refresh token");
    }
    const session = await findSessionForRefresh(payload.sid, refreshToken);
    if (!session) throw new UnauthorizedError("Session expired. Please log in again.");

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status === "SUSPENDED") throw new ForbiddenError("Account is not active");

    const tokens = await issueTokens(user, session.id);
    await rotateSession(session.id, tokens.refreshToken);
    await touchSession(session.id);
    return {
        user: publicUser(user),
        sessionId: session.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
    };
}

export async function logout({ sessionId, userId, revokeAll = false }, client) {
    if (revokeAll && userId) {
        await revokeAllSessions(userId, sessionId || undefined);
    } else if (sessionId) {
        await revokeSession(sessionId);
    }
    if (userId) {
        await recordSecurityEvent(userId, {
            type: "LOGOUT",
            severity: "INFO",
            message: revokeAll ? "Logged out from all devices" : "Logged out",
            deviceId: client?.deviceId || null,
            ipAddress: client?.ip || null,
        });
        await audit({
            userId,
            action: revokeAll ? "LOGOUT_ALL" : "LOGOUT",
            entity: "UserSession",
            entityId: sessionId || undefined,
            result: "SUCCESS",
            ipAddress: client?.ip || null,
        });
    }
    return { loggedOut: true };
}

/* ------------------------------------------------------------------ */
/* Password reset / change                                             */
/* ------------------------------------------------------------------ */

export async function requestPasswordReset(email, client) {
    const user = email
        ? await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } })
        : null;
    if (!user) return { sent: true };
    const token = randomToken(32);
    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordResetToken: hashToken(token),
            passwordResetExpires: new Date(Date.now() + 60 * 60_000),
        },
    });
    await sendPasswordResetEmail({ to: user.email, name: user.fullName, token });
    await audit({
        userId: user.id,
        actorRole: user.role,
        action: "PASSWORD_RESET_REQUEST",
        entity: "User",
        entityId: user.id,
        result: "SUCCESS",
        ipAddress: client?.ip || null,
    });
    return { sent: true, resetToken: env.isProd ? undefined : token };
}

export async function resetPassword({ token, newPassword }, client) {
    if (!token) throw new BadRequestError("Reset token is required");
    const user = await prisma.user.findFirst({
        where: {
            passwordResetToken: hashToken(token),
            passwordResetExpires: { gt: new Date() },
        },
    });
    if (!user) throw new NotFoundError("Invalid or expired reset token");

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordHash,
            passwordResetToken: null,
            passwordResetExpires: null,
            failedLoginAttempts: 0,
            lockedUntil: null,
        },
    });
    await revokeAllSessions(user.id);
    await recordSecurityEvent(user.id, {
        type: "PASSWORD_RESET",
        severity: "WARNING",
        message: "Password was reset; all sessions revoked",
        ipAddress: client?.ip || null,
    });
    await audit({
        userId: user.id,
        actorRole: user.role,
        action: "PASSWORD_RESET",
        entity: "User",
        entityId: user.id,
        result: "SUCCESS",
        ipAddress: client?.ip || null,
    });
    return { reset: true };
}

export async function changePassword(userId, { currentPassword, newPassword }, client) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    const okPass = await argon2.verify(user.passwordHash, currentPassword || "").catch(() => false);
    if (!okPass) throw new UnauthorizedError("Current password is incorrect");

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await recordSecurityEvent(user.id, {
        type: "PASSWORD_CHANGED",
        severity: "WARNING",
        message: "Password changed",
        ipAddress: client?.ip || null,
    });
    await notify(user.id, {
        type: "PASSWORD_CHANGED",
        title: "Password changed",
        message: "Your NEXA Wallet password was changed. If this was not you, reset it now.",
    });
    await audit({
        userId: user.id,
        actorRole: user.role,
        action: "PASSWORD_CHANGE",
        entity: "User",
        entityId: user.id,
        result: "SUCCESS",
        ipAddress: client?.ip || null,
    });
    return { changed: true };
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function getMe(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            wallet: true,
            privacySettings: true,
            twoFactor: { select: { enabled: true, confirmedAt: true } },
        },
    });
    if (!user) throw new NotFoundError("User not found");
    return {
        ...publicUser(user),
        createdAt: user.createdAt,
        wallet: user.wallet
            ? {
                id: user.wallet.id,
                balance: Number(user.wallet.balance),
                pendingBalance: Number(user.wallet.pendingBalance),
                currency: user.wallet.currency,
                status: user.wallet.status,
                frozenAt: user.wallet.frozenAt,
                frozenReason: user.wallet.frozenReason,
            }
            : null,
        privacy: user.privacySettings || null,
        twoFactorEnabled: !!user.twoFactor?.enabled,
    };
}

export default {
    register,
    verifyEmail,
    resendVerification,
    login,
    finishLogin,
    refresh,
    logout,
    requestPasswordReset,
    resetPassword,
    changePassword,
    getMe,
};



