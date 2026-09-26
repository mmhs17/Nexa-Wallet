import argon2 from "argon2";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../utils/errors.js";
import { finishLogin } from "./auth.service.js";
import { audit } from "./audit.service.js";
import { recordSecurityEvent, notify } from "./security.service.js";
import { getClientInfo } from "./session.service.js";

/**
 * NEXA Wallet — TOTP two-factor authentication.
 * Secrets are AES-256-GCM encrypted at rest; setup uses a
 * confirm-before-enable flow; 10 hashed backup recovery codes.
 */

authenticator.options = { window: 1 };

const RECOVERY_CODE_COUNT = 10;

function formatRecoveryCode() {
    const buf = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${buf.slice(0, 5)}-${buf.slice(5)}`;
}

async function mintRecoveryCodes(userId) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => formatRecoveryCode());
    await prisma.recoveryCode.deleteMany({ where: { userId } });
    for (const code of codes) {
        await prisma.recoveryCode.create({
            data: { userId, codeHash: await argon2.hash(code, { type: argon2.argon2id }) },
        });
    }
    return codes;
}

export async function getStatus(userId) {
    const tfa = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    const unusedCodes = await prisma.recoveryCode.count({ where: { userId, usedAt: null } });
    return {
        enabled: !!tfa?.enabled,
        confirmedAt: tfa?.confirmedAt || null,
        unusedRecoveryCodes: unusedCodes,
    };
}

/** Step 1: generate secret + otpauth QR (not yet enabled). */
export async function beginSetup(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    const existing = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (existing?.enabled) throw new BadRequestError("Two-factor authentication is already enabled");

    const secret = authenticator.generateSecret();
    await prisma.twoFactorAuth.upsert({
        where: { userId },
        create: { userId, enabled: false, secret: encrypt(secret) },
        update: { enabled: false, secret: encrypt(secret), confirmedAt: null },
    });

    const otpauth = authenticator.keyuri(user.email, "NEXA Wallet", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    return { otpauthUrl: otpauth, qrDataUrl };
}

/** Step 2: verify a TOTP code against the pending secret; enable + mint codes. */
export async function confirmSetup(userId, token, req) {
    const tfa = await prisma.twoFactorAuth.findUnique({ where: { userId } });
    if (!tfa?.secret) throw new BadRequestError("No 2FA setup in progress. Start setup first.");
    if (tfa.enabled) throw new BadRequestError("Two-factor authentication is already enabled");
    const secret = decrypt(tfa.secret);
    if (!secret || !authenticator.check(String(token), secret)) {
        throw new UnauthorizedError("Invalid verification code");
    }

    await prisma.twoFactorAuth.update({
        where: { userId },
        data: { enabled: true, confirmedAt: new Date() },
    });
    const codes = await mintRecoveryCodes(userId);

    const client = req ? getClientInfo(req) : {};
    await recordSecurityEvent(userId, {
        type: "TWO_FA_ENABLED",
        severity: "INFO",
        message: "Two-factor authentication enabled",
        ipAddress: client?.ip || null,
    });
    await notify(userId, {
        type: "TWO_FA_CHANGE",
        title: "2FA enabled",
        message: "Two-factor authentication was enabled on your account.",
    });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    await audit({
        userId,
        actorRole: user?.role || undefined,
        action: "TWO_FA_ENABLE",
        entity: "TwoFactorAuth",
        entityId: userId,
        result: "SUCCESS",
        ipAddress: client?.ip || null,
    });
    return { enabled: true, recoveryCodes: codes };
}

/** Step 2 of login for TOTP accounts: verify code (or recovery code), activate session. */
export async function verifyLogin({ pendingSessionId, token, recoveryCode }, req) {
    if (!pendingSessionId) throw new BadRequestError("pendingSessionId is required");
    const session = await prisma.userSession.findUnique({ where: { id: pendingSessionId } });
    if (!session) throw new NotFoundError("Login session not found or expired");

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { twoFactor: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (!user.twoFactor?.enabled) throw new BadRequestError("2FA is not enabled on this account");

    const client = req ? getClientInfo(req) : {};
    let method = "totp";

    if (recoveryCode) {
        const okRecovery = await consumeRecoveryCode(user.id, recoveryCode);
        if (!okRecovery) throw new UnauthorizedError("Invalid recovery code");
        method = "recovery_code";
        await recordSecurityEvent(user.id, {
            type: "RECOVERY_CODE_USED",
            severity: "WARNING",
            message: "A 2FA recovery code was used to sign in",
            ipAddress: client?.ip || null,
        });
    } else {
        const secret = decrypt(user.twoFactor.secret);
        if (!secret || !authenticator.check(String(token || ""), secret)) {
            await recordSecurityEvent(user.id, {
                type: "LOGIN_FAILED",
                severity: "WARNING",
                message: "Failed 2FA verification",
                ipAddress: client?.ip || null,
            });
            throw new UnauthorizedError("Invalid verification code");
        }
    }

    await recordSecurityEvent(user.id, {
        type: "TWO_FA_VERIFIED",
        severity: "INFO",
        message: `Two-factor verification passed (${method})`,
        ipAddress: client?.ip || null,
    });
    return finishLogin(user, client, session.id);
}

async function consumeRecoveryCode(userId, code) {
    const codes = await prisma.recoveryCode.findMany({
        where: { userId, usedAt: null },
    });
    for (const row of codes) {
        const match = await argon2.verify(row.codeHash, code).catch(() => false);
        if (match) {
            await prisma.recoveryCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
            return true;
        }
    }
    return false;
}

/** Disable 2FA (requires password) and wipe secrets + codes. */
export async function disable(userId, password, req) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { twoFactor: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (!user.twoFactor?.enabled) throw new BadRequestError("2FA is not enabled");
    const okPass = await argon2.verify(user.passwordHash, password || "").catch(() => false);
    if (!okPass) throw new UnauthorizedError("Password is incorrect");

    await prisma.$transaction([
        prisma.twoFactorAuth.update({ where: { userId }, data: { enabled: false, secret: null } }),
        prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
    const client = req ? getClientInfo(req) : {};
    await recordSecurityEvent(userId, {
        type: "TWO_FA_DISABLED",
        severity: "WARNING",
        message: "Two-factor authentication disabled",
        ipAddress: client?.ip || null,
    });
    await notify(userId, {
        type: "TWO_FA_CHANGE",
        title: "2FA disabled",
        message: "Two-factor authentication was disabled. Re-enable it to keep your account protected.",
    });
    await audit({
        userId,
        actorRole: user.role,
        action: "TWO_FA_DISABLE",
        entity: "TwoFactorAuth",
        entityId: userId,
        result: "SUCCESS",
        ipAddress: client?.ip || null,
    });
    return { disabled: true };
}

/** Regenerate backup codes (requires password); old codes invalidated. */
export async function regenerateCodes(userId, password) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { twoFactor: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (!user.twoFactor?.enabled) throw new BadRequestError("2FA is not enabled");
    const okPass = await argon2.verify(user.passwordHash, password || "").catch(() => false);
    if (!okPass) throw new UnauthorizedError("Password is incorrect");

    const codes = await mintRecoveryCodes(userId);
    await audit({
        userId,
        actorRole: user.role,
        action: "TWO_FA_CODES_REGENERATE",
        entity: "TwoFactorAuth",
        entityId: userId,
        result: "SUCCESS",
    });
    return { recoveryCodes: codes };
}

export default {
    getStatus,
    beginSetup,
    confirmSetup,
    verifyLogin,
    disable,
    regenerateCodes,
};

