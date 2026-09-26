import prisma from "../config/prisma.js";
import argon2 from "argon2";
import { randomUUID } from "crypto";
import { generateTransactionReference as generateTxnId } from "../utils/ids.js";
import { buildSendContext, scoreSend, persistDecision, explainAssessment } from "./fraud-engine/fraud.service.js";
import { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError, WalletLockedError, PaymentBlockedError } from "../utils/errors.js";
import { UNLOCK_COOLDOWN_MINUTES } from "../config/constants.js";
import { audit } from "./audit.service.js";
import { recordSecurityEvent, notify } from "./security.service.js";
import { isShieldedFrom } from "./privacy.service.js";
import { assertTxPin } from "./txpin.service.js";
import QRCode from "qrcode";

/**
 * NEXA Wallet — wallet + P2P payment service.
 * Money movements are PostgreSQL transactions (debit + credit +
 * ledger row commit atomically). Risk scoring hooks in Phase 5.
 */

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 500000;

function toNumber(d) {
    return d === null || d === undefined ? 0 : Number(d);
}

function assertAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < MIN_AMOUNT) throw new BadRequestError("Amount must be at least ₹1");
    if (n > MAX_AMOUNT) throw new BadRequestError("Amount exceeds sandbox limit of ₹5,00,000");
    return Math.round(n * 100) / 100;
}

async function getActiveWallet(userId) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError("Wallet not found");
    if (wallet.status === "CLOSED") throw new ForbiddenError("Wallet is closed");
    return wallet;
}

function ensureNotFrozen(wallet) {
    if (wallet.status === "FROZEN") {
        throw new WalletLockedError(
            `Wallet frozen${wallet.frozenReason ? `: ${wallet.frozenReason}` : ""}. Visit Security Center to unlock.`
        );
    }
}

/** Resolve a recipient by username / email / phone / NEXA ID. */
export async function resolveRecipient(identifier, viewerId = null) {
    const q = String(identifier || "").trim();
    if (!q) throw new BadRequestError("Recipient identifier is required");
    const user = await prisma.user.findFirst({
        where: {
            OR: [{ username: q.toLowerCase() }, { email: q.toLowerCase() }, { phone: q }, { nexaId: q.toUpperCase() }],
        },
        select: { id: true, nexaId: true, username: true, fullName: true, avatarUrl: true, status: true, createdAt: true },
    });
    if (!user) throw new NotFoundError("Recipient not found on NEXA Wallet");
    if (user.status !== "ACTIVE") throw new ForbiddenError("Recipient account is not active");
    // Privacy Shield (Phase 6): a shielded user is only discoverable by
    // existing payees. Same "not found" message to prevent enumeration.
    if (await isShieldedFrom(user.id, viewerId)) {
        throw new NotFoundError("Recipient not found on NEXA Wallet");
    }
    return user;
}

export async function getWallet(userId) {
    const w = await getActiveWallet(userId);
    return {
        id: w.id, balance: toNumber(w.balance), pendingBalance: toNumber(w.pendingBalance),
        currency: w.currency, status: w.status, frozenAt: w.frozenAt, frozenReason: w.frozenReason,
    };
}


/** Sandbox deposit — simulated gateway credit (DEMO, no real money). */
export async function addMoney(userId, { amount, method = "UPI", note = null, categoryId = null }, client = {}) {
    const value = assertAmount(amount);
    const wallet = await getActiveWallet(userId);
    ensureNotFrozen(wallet);
    const txnId = generateTxnId();
    const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.wallet.update({
            where: { id: wallet.id }, data: { balance: { increment: value } },
        });
        const txn = await tx.transaction.create({
            data: {
                reference: txnId, type: "ADD_MONEY", status: "COMPLETED",
                amount: value, currency: wallet.currency, senderId: null, receiverId: userId,
                senderWalletId: null, receiverWalletId: wallet.id,
                paymentMethod: method, categoryId: categoryId || undefined,
                note: note || `Sandbox deposit via ${method}`,
                deviceId: client.deviceId || undefined, ipAddress: client.ip || undefined,
                metadata: { userAgent: client.userAgent || null, sandbox: true },
                completedAt: new Date(),
            },
        });
        return { wallet: updated, txn };
    });
    await notify(userId, {
        type: "PAYMENT_RECEIVED", title: `₹${value.toLocaleString("en-IN")} added`,
        message: `Sandbox deposit ${txnId} completed.`,
    });
    await audit({
        userId, actorRole: "USER", action: "WALLET_ADD_MONEY", entity: "Transaction",
        entityId: result.txn.id, result: "SUCCESS", ipAddress: client.ip || null,
        metadata: { txnId, amount: value, method },
    });
    return { txnId, amount: value, balance: toNumber(result.wallet.balance) };
}

/** Sandbox withdrawal — simulated payout to a linked destination. */
export async function withdraw(userId, { amount, destination = "Bank account", note = null }, client = {}) {
    const value = assertAmount(amount);
    const wallet = await getActiveWallet(userId);
    ensureNotFrozen(wallet);
    if (toNumber(wallet.balance) < value) throw new BadRequestError("Insufficient wallet balance");
    const txnId = generateTxnId();
    const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
        if (toNumber(fresh.balance) < value) throw new BadRequestError("Insufficient wallet balance");
        const updated = await tx.wallet.update({
            where: { id: wallet.id }, data: { balance: { decrement: value } },
        });
        const txn = await tx.transaction.create({
            data: {
                reference: txnId, type: "WITHDRAW", status: "COMPLETED",
                amount: value, currency: wallet.currency, senderId: userId, receiverId: null,
                senderWalletId: wallet.id, receiverWalletId: null,
                note: note || `Sandbox withdrawal to ${destination}`,
                deviceId: client.deviceId || undefined, ipAddress: client.ip || undefined,
                metadata: { destination, sandbox: true },
                completedAt: new Date(),
            },
        });
        return { wallet: updated, txn };
    });
    await notify(userId, {
        type: "PAYMENT_SENT", title: `₹${value.toLocaleString("en-IN")} withdrawn`,
        message: `Sandbox withdrawal ${txnId} to ${destination} completed.`,
    });
    await audit({
        userId, actorRole: "USER", action: "WALLET_WITHDRAW", entity: "Transaction",
        entityId: result.txn.id, result: "SUCCESS", ipAddress: client.ip || null,
        metadata: { txnId, amount: value, destination },
    });
    return { txnId, amount: value, balance: toNumber(result.wallet.balance) };
}

/** P2P transfer: one ledger row + atomic debit/credit. */
export async function sendMoney(senderId, { to, amount, note = null, categoryId = null, pin = null }, client = {}) {
    const value = assertAmount(amount);

    // --- Transaction security key gate (4-digit PIN), BEFORE scoring. ---
    // If the user has opted in, money will not move without the key.
    const pinResult = await assertTxPin(senderId, pin);
    const pinVerified = pinResult.verified;

    const recipient = await resolveRecipient(to, senderId);
    if (recipient.id === senderId) throw new BadRequestError("You cannot send money to yourself");
    const senderWallet = await getActiveWallet(senderId);
    ensureNotFrozen(senderWallet);
    const receiverWallet = await getActiveWallet(recipient.id);

    // --- NEXA Risk Engine gate (Phase 5): score BEFORE touching money. ---
    const context = await buildSendContext({ senderId, amount: value, recipientUserId: recipient.id, client });
    const assessment = scoreSend(context);

    // BLOCK band: no money moves; still leave a BLOCKED ledger row + trail
    // so the attempt is visible in history and reviewable by admins.
    if (assessment.decision === "BLOCK") {
        const blockedTxnId = generateTxnId();
        const blocked = await prisma.$transaction(async (tx) => {
            const txn = await tx.transaction.create({
                data: {
                    reference: blockedTxnId, type: "SEND", status: "BLOCKED",
                    amount: value, currency: senderWallet.currency,
                    senderId, receiverId: recipient.id,
                    senderWalletId: senderWallet.id, receiverWalletId: receiverWallet.id,
                    categoryId: categoryId || undefined, note: note || `P2P to ${recipient.fullName}`,
                    requiresReview: true,
                    deviceId: client.deviceId || undefined, ipAddress: client.ip || undefined,
                    metadata: { userAgent: client.userAgent || null, sandbox: true, fraudDecision: "BLOCK", factors: assessment.factors, txPinVerified: pinVerified },
                },
            });
            const ids = await persistDecision(tx, { transactionId: txn.id, userId: senderId, assessment, context });
            return { txn, ...ids };
        });
        await recordSecurityEvent(senderId, {
            type: "PAYMENT_BLOCKED", severity: "CRITICAL",
            message: `Blocked P2P Rs.${value} to ${recipient.username} (${blockedTxnId}). ${explainAssessment(assessment)}`,
            ipAddress: client.ip || null,
        });
        await notify(senderId, {
            type: "PAYMENT_BLOCKED",
            title: "Payment blocked — suspected fraud",
            message: `Your Rs.${value} transfer to ${recipient.fullName} was blocked. Ref ${blockedTxnId}.`,
        });
        await audit({
            userId: senderId, actorRole: "USER", action: "P2P_SEND_BLOCKED", entity: "Transaction",
            entityId: blocked.txn.id, result: "BLOCKED", ipAddress: client.ip || null,
            metadata: { txnId: blockedTxnId, amount: value, to: recipient.username, riskScore: assessment.score, factors: assessment.factors },
        });
        throw new PaymentBlockedError(
            `Payment blocked by NEXA Risk Engine (score ${assessment.score}/100). Ref ${blockedTxnId}.`,
            { reference: blockedTxnId, transactionId: blocked.txn.id, riskScore: assessment.score, riskLevel: assessment.level, factors: assessment.factors, alertId: blocked.alertId }
        );
    }
    const isReview = assessment.decision === "REVIEW";

    if (Number(senderWallet.balance) < value) throw new BadRequestError("Insufficient wallet balance");
    const txnId = generateTxnId();
    const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
        if (Number(fresh.balance) < value) throw new BadRequestError("Insufficient wallet balance");
        if (fresh.status === "FROZEN") throw new WalletLockedError("Wallet is frozen. Payment activity is restricted.");
        const [debited] = await Promise.all(
            isReview
                ? [
                    // REVIEW hold: lock sender funds in pendingBalance and park
                    // the credit in the receiver's pendingBalance (escrow).
                    // Admin approval/release moves these to real balances.
                    tx.wallet.update({ where: { id: senderWallet.id }, data: { balance: { decrement: value }, pendingBalance: { increment: value } } }),
                    tx.wallet.update({ where: { id: receiverWallet.id }, data: { pendingBalance: { increment: value } } }),
                ]
                : [
                    tx.wallet.update({ where: { id: senderWallet.id }, data: { balance: { decrement: value } } }),
                    tx.wallet.update({ where: { id: receiverWallet.id }, data: { balance: { increment: value } } }),
                ]
        );
        const txn = await tx.transaction.create({
            data: {
                reference: txnId, type: "SEND", status: isReview ? "UNDER_REVIEW" : "COMPLETED",
                amount: value, currency: senderWallet.currency, senderId, receiverId: recipient.id,
                senderWalletId: senderWallet.id, receiverWalletId: receiverWallet.id,
                categoryId: categoryId || undefined, note: note || `P2P to ${recipient.fullName}`,
                requiresReview: isReview,
                deviceId: client.deviceId || undefined, ipAddress: client.ip || undefined,
                metadata: { userAgent: client.userAgent || null, sandbox: true, fraudDecision: assessment.decision, factors: assessment.factors, txPinVerified: pinVerified },
                completedAt: isReview ? null : new Date(),
            },
        });
        await persistDecision(tx, { transactionId: txn.id, userId: senderId, assessment, context });
        await tx.beneficiary.upsert({
            where: { userId_handle: { userId: senderId, handle: recipient.username } },
            create: {
                userId: senderId, beneficiaryUserId: recipient.id,
                displayName: recipient.fullName, handle: recipient.username, handleType: "USERNAME",
                nickname: recipient.fullName,
                lastTransactionAt: new Date(), transactionCount: 1,
            },
            update: { lastTransactionAt: new Date(), transactionCount: { increment: 1 } },
        });
        return { wallet: debited, txn };
    });
    await notify(senderId, {
        type: "PAYMENT_SENT", title: `₹${value.toLocaleString("en-IN")} sent to ${recipient.fullName}`,
        message: `${txnId} ${isReview ? "held under review." : "completed."} Risk ${assessment.score}/100.`,
    });
    await notify(recipient.id, {
        type: "PAYMENT_RECEIVED", title: `₹${value.toLocaleString("en-IN")} received`,
        message: `NEXA transfer • Ref ${txnId}.`,
    });
    await recordSecurityEvent(senderId, {
        type: isReview ? "SUSPICIOUS_LOGIN" : "PAYMENT_VERIFIED", severity: isReview ? "WARNING" : "INFO",
        message: `P2P-RISK ${assessment.score}: ₹${value.toLocaleString("en-IN")} to ${recipient.username} (${txnId})`,
        ipAddress: client.ip || null,
    });
    await audit({
        userId: senderId, actorRole: "USER", action: isReview ? "P2P_SEND_REVIEW" : "P2P_SEND", entity: "Transaction",
        entityId: result.txn.id, result: "SUCCESS", ipAddress: client.ip || null,
        metadata: { txnId, amount: value, to: recipient.username, riskScore: assessment.score, decision: assessment.decision },
    });
    return {
        txnId, amount: value,
        to: { nexaId: recipient.nexaId, username: recipient.username, fullName: recipient.fullName },
        balance: toNumber(result.wallet.balance),
        pendingBalance: isReview ? toNumber(result.wallet.pendingBalance) : undefined,
        risk: { score: assessment.score, level: assessment.level, decision: assessment.decision, factors: assessment.factors },
        status: isReview ? "UNDER_REVIEW" : "COMPLETED",
        requiresReview: isReview,
        txPinVerified: pinVerified,
    };
}

/** Recipient trust profile — familiarity without exposing PII. */
export async function getRecipientProfile(viewerId, identifier) {
    const recipient = await resolveRecipient(identifier, viewerId);
    const [b, lastTxn] = await Promise.all([
        prisma.beneficiary.findFirst({
            where: { userId: viewerId, beneficiaryUserId: recipient.id },
        }),
        prisma.transaction.findFirst({
            where: { senderId: viewerId, receiverId: recipient.id, status: "COMPLETED" },
            orderBy: { createdAt: "desc" }, select: { amount: true, createdAt: true },
        }),
    ]);
    const count = b?.transactionCount ?? 0;
    return {
        nexaId: recipient.nexaId, username: recipient.username, fullName: recipient.fullName,
        avatarUrl: recipient.avatarUrl, verified: true, memberSince: recipient.createdAt,
        relationship: count === 0 ? "New" : count < 5 ? "Recent" : "Established",
        previousTransactions: count,
        lastTransaction: lastTxn ? { amount: toNumber(lastTxn.amount), at: lastTxn.createdAt } : null,
        isFavorite: b?.isFavorite ?? false,
        trustScore: b?.trustScore ?? 50,
    };
}

export async function listCategories(userId) {
    const cats = await prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } });
    return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, color: c.color }));
}

// ---------------------------------------------------------------------------
// EMERGENCY WALLET LOCK (Phase 6) — instant self-freeze, password-gated
// release after a cooling-off period.
// ---------------------------------------------------------------------------

export async function getLockStatus(userId) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError("Wallet not found");
    const locked = wallet.status === "FROZEN";
    return {
        status: wallet.status,
        locked,
        frozenAt: wallet.frozenAt,
        frozenReason: wallet.frozenReason,
        unlockAvailableAt: locked && wallet.frozenAt
            ? new Date(wallet.frozenAt.getTime() + UNLOCK_COOLDOWN_MINUTES * 60 * 1000)
            : null,
        cooldownMinutes: UNLOCK_COOLDOWN_MINUTES,
    };
}

/** Panic button: freeze the wallet instantly. Idempotent-hostile (400 if already frozen). */
export async function lockWallet(userId, { reason = null } = {}, client = {}) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError("Wallet not found");
    if (wallet.status === "CLOSED") throw new ForbiddenError("Wallet is closed");
    if (wallet.status === "FROZEN") throw new BadRequestError("Wallet is already locked");
    const frozenReason = reason
        ? `Self-initiated emergency lock: ${String(reason).slice(0, 140)}`
        : "Self-initiated emergency lock";
    const updated = await prisma.wallet.update({
        where: { userId },
        data: { status: "FROZEN", frozenAt: new Date(), frozenReason },
    });
    await recordSecurityEvent(userId, {
        type: "WALLET_FROZEN", severity: "CRITICAL",
        message: `Emergency lock activated${reason ? `: ${String(reason).slice(0, 80)}` : ""}.`,
        ipAddress: client.ip || null,
    });
    await notify(userId, {
        type: "WALLET_FREEZE", title: "Emergency lock active",
        message: "Your wallet is locked and outgoing payments are blocked. Unlock needs your password after a 30-minute cooling-off period.",
    });
    await audit({
        userId, actorRole: "USER", action: "WALLET_EMERGENCY_LOCK", entity: "Wallet",
        entityId: wallet.id, result: "SUCCESS", ipAddress: client.ip || null,
        metadata: { reason: reason || null },
    });
    return {
        status: updated.status,
        locked: true,
        frozenAt: updated.frozenAt,
        frozenReason: updated.frozenReason,
        unlockAvailableAt: new Date(updated.frozenAt.getTime() + UNLOCK_COOLDOWN_MINUTES * 60 * 1000),
        cooldownMinutes: UNLOCK_COOLDOWN_MINUTES,
    };
}

/** Release an emergency lock: cooling-off must have elapsed + password must match. */
export async function unlockWallet(userId, password, client = {}) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError("Wallet not found");
    if (wallet.status !== "FROZEN") throw new BadRequestError("Wallet is not locked");
    const unlockAt = wallet.frozenAt ? wallet.frozenAt.getTime() + UNLOCK_COOLDOWN_MINUTES * 60 * 1000 : 0;
    if (Date.now() < unlockAt) {
        await audit({
            userId, actorRole: "USER", action: "WALLET_EMERGENCY_UNLOCK", entity: "Wallet",
            entityId: wallet.id, result: "COOLDOWN", ipAddress: client.ip || null,
        });
        throw new ForbiddenError(`Cooling-off period active. Unlock available at ${new Date(unlockAt).toISOString()}`);
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const ok = await argon2.verify(user.passwordHash, String(password || ""));
    if (!ok) {
        await audit({
            userId, actorRole: "USER", action: "WALLET_EMERGENCY_UNLOCK", entity: "Wallet",
            entityId: wallet.id, result: "FAILURE", ipAddress: client.ip || null,
        });
        throw new UnauthorizedError("Incorrect password");
    }
    const updated = await prisma.wallet.update({
        where: { userId },
        data: { status: "ACTIVE", frozenAt: null, frozenReason: null },
    });
    await recordSecurityEvent(userId, {
        type: "WALLET_UNFROZEN", severity: "WARNING",
        message: "Emergency lock released after cooling-off and password confirmation.",
        ipAddress: client.ip || null,
    });
    await notify(userId, {
        type: "WALLET_FREEZE", title: "Wallet unlocked",
        message: "Your wallet is active again. If you did not do this, lock it immediately.",
    });
    await audit({
        userId, actorRole: "USER", action: "WALLET_EMERGENCY_UNLOCK", entity: "Wallet",
        entityId: wallet.id, result: "SUCCESS", ipAddress: client.ip || null,
    });
    return { status: updated.status, locked: false };
}

export default { getWallet, addMoney, withdraw, sendMoney, getRecipientProfile, listCategories, resolveRecipient, getLockStatus, lockWallet, unlockWallet };

