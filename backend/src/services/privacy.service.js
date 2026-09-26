import prisma from "../config/prisma.js";
import { BadRequestError, UnprocessableError } from "../utils/errors.js";
import { audit } from "./audit.service.js";

/**
 * NEXA Wallet — Privacy Shield service (Phase 6).
 * Stores user display/visibility preferences and enforces the one
 * server-side control that matters for safety: `shieldActive` removes
 * the user from recipient discovery (anti-enumeration).
 */

const BOOLEAN_FIELDS = ["shieldActive", "hideBalance", "hideTransactionAmounts", "hideRecipientNames", "hideAnalytics"];

function shape(settings) {
    return {
        shieldActive: settings.shieldActive,
        hideBalance: settings.hideBalance,
        hideTransactionAmounts: settings.hideTransactionAmounts,
        hideRecipientNames: settings.hideRecipientNames,
        hideAnalytics: settings.hideAnalytics,
        autoLockMinutes: settings.autoLockMinutes,
        updatedAt: settings.updatedAt,
    };
}

/** Fetch (or create with defaults) the user's privacy settings. */
export async function getPrivacy(userId) {
    const settings = await prisma.privacySettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });
    return shape(settings);
}

/** Apply a partial update; unknown/invalid fields are rejected loudly. */
export async function updatePrivacy(userId, patch = {}) {
    const data = {};
    for (const key of BOOLEAN_FIELDS) {
        if (patch[key] !== undefined) {
            if (typeof patch[key] !== "boolean") {
                throw new UnprocessableError(`${key} must be a boolean`);
            }
            data[key] = patch[key];
        }
    }
    if (patch.autoLockMinutes !== undefined) {
        const n = Number(patch.autoLockMinutes);
        if (!Number.isInteger(n) || n < 1 || n > 120) {
            throw new UnprocessableError("autoLockMinutes must be an integer between 1 and 120");
        }
        data.autoLockMinutes = n;
    }
    if (Object.keys(data).length === 0) {
        throw new BadRequestError("No valid privacy fields provided");
    }
    const settings = await prisma.privacySettings.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
    });
    await audit({
        userId,
        actorRole: "USER",
        action: "PRIVACY_UPDATED",
        entity: "PrivacySettings",
        entityId: settings.id,
        result: "SUCCESS",
        metadata: data,
    });
    return shape(settings);
}

/**
 * Shield gate used by recipient resolution. Returns silently when the
 * viewer may see the target; throws nothing here (caller maps result).
 */
export async function isShieldedFrom(targetUserId, viewerId) {
    if (!viewerId || String(viewerId) === String(targetUserId)) return false;
    const shield = await prisma.privacySettings.findUnique({
        where: { userId: targetUserId },
        select: { shieldActive: true },
    });
    if (!shield?.shieldActive) return false;
    const known = await prisma.beneficiary.findFirst({
        where: { userId: viewerId, beneficiaryUserId: targetUserId },
        select: { id: true },
    });
    return !known; // shielded from strangers, visible to past payees
}

export default { getPrivacy, updatePrivacy, isShieldedFrom };
