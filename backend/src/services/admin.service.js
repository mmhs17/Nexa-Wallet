/**
 * NEXA Wallet — Admin Fraud Command Center service (Phase 10).
 * Admin-only review queue for flagged transactions and fraud alerts,
 * plus the immutable audit trail. Every admin action writes its own
 * audit row + notifies the affected user.
 */

import prisma from "../config/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { audit } from "./audit.service.js";
import { notify, recordSecurityEvent } from "./security.service.js";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

const ALLOWED_ALERT_STATUS = ["OPEN", "REVIEWING", "RESOLVED_APPROVED", "RESOLVED_REJECTED"];
const ALLOWED_TXN_STATUS = ["BLOCKED", "UNDER_REVIEW", "COMPLETED", "REVERSED", "FAILED", "PENDING"];

function parsePage(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.pageSize ?? query.limit, 10) || PAGE_SIZE_DEFAULT));
    return { page, pageSize };
}

function toNumber(d) {
    return d === null || d === undefined ? null : Number(d);
}

function shapeAlert(a) {
    return {
        id: a.id,
        transactionId: a.transactionId,
        reference: a.transaction?.reference ?? null,
        type: a.transaction?.type ?? null,
        transactionStatus: a.transaction?.status ?? null,
        amount: toNumber(a.transaction?.amount),
        currency: a.transaction?.currency ?? null,
        sender: a.transaction?.sender ? { id: a.transaction.sender.id, username: a.transaction.sender.username, fullName: a.transaction.sender.fullName, nexaId: a.transaction.sender.nexaId } : null,
        receiver: a.transaction?.receiver ? { id: a.transaction.receiver.id, username: a.transaction.receiver.username, fullName: a.transaction.receiver.fullName, nexaId: a.transaction.receiver.nexaId } : null,
        score: a.riskScore,
        level: a.riskLevel,
        factors: a.factors,
        status: a.status,
        reviewedBy: a.reviewedBy,
        reviewNote: a.reviewNote,
        resolvedAt: a.resolvedAt,
        createdAt: a.createdAt,
    };
}

function shapeTxn(t) {
    return {
        id: t.id,
        reference: t.reference,
        type: t.type,
        status: t.status,
        amount: toNumber(t.amount),
        fee: toNumber(t.fee),
        currency: t.currency,
        sender: t.sender ? { id: t.sender.id, username: t.sender.username, fullName: t.sender.fullName, nexaId: t.sender.nexaId } : null,
        receiver: t.receiver ? { id: t.receiver.id, username: t.receiver.username, fullName: t.receiver.fullName, nexaId: t.receiver.nexaId } : null,
        requiresReview: t.requiresReview,
        note: t.note,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        risk: t.risk ? { score: t.risk.riskScore, level: t.risk.riskLevel, factors: t.risk.factors, recommendation: t.risk.recommendation, engineVersion: t.risk.engineVersion } : null,
        alert: t.fraudAlert ? { id: t.fraudAlert.id, status: t.fraudAlert.status, score: t.fraudAlert.riskScore, level: t.fraudAlert.riskLevel } : null,
    };
}

/** Command-center queue stats — open counts + review backlog by level. */
export async function getQueueStats() {
    const [openAlerts, reviewingAlerts, underReviewTxns, blockedTxns, alertsByLevel] = await Promise.all([
        prisma.fraudAlert.count({ where: { status: "OPEN" } }),
        prisma.fraudAlert.count({ where: { status: "REVIEWING" } }),
        prisma.transaction.count({ where: { status: "UNDER_REVIEW" } }),
        prisma.transaction.count({ where: { status: "BLOCKED" } }),
        prisma.fraudAlert.groupBy({ by: ["riskLevel"], where: { status: { in: ["OPEN", "REVIEWING"] } }, _count: { _all: true } }),
    ]);
    const byLevel = {};
    for (const row of alertsByLevel) byLevel[row.riskLevel] = row._count._all;
    return {
        openAlerts,
        reviewingAlerts,
        pendingAlerts: openAlerts + reviewingAlerts,
        underReviewTxns,
        blockedTxns,
        pendingTransactions: underReviewTxns + blockedTxns,
        pendingByLevel: byLevel,
    };
}

/** Global flagged-transaction queue (BLOCKED / UNDER_REVIEW first). */
export async function listFlaggedTransactions(query = {}) {
    const { page, pageSize } = parsePage(query);
    const statusFilter = String(query.status || "").toUpperCase();
    const where = statusFilter && ALLOWED_TXN_STATUS.includes(statusFilter)
        ? { status: statusFilter }
        : { status: { in: ["BLOCKED", "UNDER_REVIEW"] } };
    const [total, rows] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
                receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
                risk: { select: { riskScore: true, riskLevel: true, factors: true, recommendation: true, engineVersion: true } },
                fraudAlert: { select: { id: true, status: true, riskScore: true, riskLevel: true } },
            },
        }),
    ]);
    return { items: rows.map(shapeTxn), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Global fraud-alert queue across all users. */
export async function listAllAlerts(query = {}) {
    const { page, pageSize } = parsePage(query);
    const statusFilter = String(query.status || "").toUpperCase();
    const where = statusFilter && ALLOWED_ALERT_STATUS.includes(statusFilter) ? { status: statusFilter } : {};
    const [total, rows] = await Promise.all([
        prisma.fraudAlert.count({ where }),
        prisma.fraudAlert.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                transaction: {
                    select: {
                        reference: true, type: true, status: true, amount: true, currency: true,
                        sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
                        receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
                    },
                },
            },
        }),
    ]);
    return { items: rows.map(shapeAlert), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Full detail of one alert (admin sees both parties + risk trail). */
export async function getAlertDetail(alertId) {
    const a = await prisma.fraudAlert.findUnique({
        where: { id: alertId },
        include: {
            transaction: {
                include: {
                    sender: { select: { id: true, username: true, fullName: true, nexaId: true, email: true } },
                    receiver: { select: { id: true, username: true, fullName: true, nexaId: true, email: true } },
                    risk: true,
                },
            },
        },
    });
    if (!a) throw new NotFoundError("Fraud alert not found");
    return {
        ...shapeAlert(a),
        userId: a.userId,
        riskDetail: a.transaction?.risk ? {
            score: a.transaction.risk.riskScore,
            level: a.transaction.risk.riskLevel,
            factors: a.transaction.risk.factors,
            recommendation: a.transaction.risk.recommendation,
            engineVersion: a.transaction.risk.engineVersion,
            featureVector: a.transaction.risk.featureVector ?? null,
            evaluatedAt: a.transaction.risk.createdAt,
        } : null,
    };
}
/** Move an OPEN alert to REVIEWING (claim it). */
export async function claimAlert(adminId, alertId, client = {}) {
    const a = await prisma.fraudAlert.findUnique({ where: { id: alertId }, select: { id: true, status: true } });
    if (!a) throw new NotFoundError("Fraud alert not found");
    if (a.status !== "OPEN") throw new BadRequestError(`Only OPEN alerts can be claimed (current: ${a.status})`);
    const updated = await prisma.fraudAlert.update({
        where: { id: alertId },
        data: { status: "REVIEWING", reviewedBy: adminId },
    });
    await audit({
        userId: adminId, actorRole: "ADMIN", action: "FRAUD_ALERT_CLAIM", entity: "FraudAlert",
        entityId: alertId, result: "SUCCESS", ipAddress: client.ip || null,
    });
    return { id: updated.id, status: updated.status, reviewedBy: updated.reviewedBy };
}
/**
 * Resolve an alert: APPROVE releases an UNDER_REVIEW hold (escrow
 * to real balances), REJECT reverses it (sender refunded). BLOCKED
 * rows carry no money movement; REJECT closes them as REVERSED
 * while an APPROVE override settles them for real.
 */
export async function resolveAlert(adminId, alertId, { decision, note = null }, client = {}) {
    const want = String(decision || "").toUpperCase();
    if (!["APPROVE", "REJECT"].includes(want)) throw new BadRequestError("decision must be APPROVE or REJECT");
    const a = await prisma.fraudAlert.findUnique({ where: { id: alertId }, include: { transaction: true } });
    if (!a) throw new NotFoundError("Fraud alert not found");
    if (!["OPEN", "REVIEWING"].includes(a.status)) throw new BadRequestError(`Alert is already resolved (${a.status})`);
    const txn = a.transaction;
    if (!txn) throw new NotFoundError("Linked transaction not found");
    const finalStatus = want === "APPROVE" ? "RESOLVED_APPROVED" : "RESOLVED_REJECTED";
    const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.transaction.findUnique({
            where: { id: txn.id },
            select: { id: true, status: true, amount: true, senderWalletId: true, receiverWalletId: true },
        });
        if (!fresh) throw new NotFoundError("Linked transaction not found");
        const amount = Number(fresh.amount);
        if (fresh.status === "UNDER_REVIEW" && want === "APPROVE") {
            if (fresh.senderWalletId) {
                await tx.wallet.update({ where: { id: fresh.senderWalletId }, data: { pendingBalance: { decrement: amount } } });
            }
            if (fresh.receiverWalletId) {
                await tx.wallet.update({
                    where: { id: fresh.receiverWalletId },
                    data: { pendingBalance: { decrement: amount }, balance: { increment: amount } },
                });
            }
            await tx.transaction.update({ where: { id: fresh.id }, data: { status: "COMPLETED", requiresReview: false, completedAt: new Date() } });
        } else if (fresh.status === "UNDER_REVIEW") {
            if (fresh.senderWalletId) {
                await tx.wallet.update({
                    where: { id: fresh.senderWalletId },
                    data: { pendingBalance: { decrement: amount }, balance: { increment: amount } },
                });
            }
            if (fresh.receiverWalletId) {
                await tx.wallet.update({ where: { id: fresh.receiverWalletId }, data: { pendingBalance: { decrement: amount } } });
            }
            await tx.transaction.update({ where: { id: fresh.id }, data: { status: "REVERSED", requiresReview: false } });
        } else if (fresh.status === "BLOCKED" && want === "APPROVE") {
            const senderW = fresh.senderWalletId
                ? await tx.wallet.findUnique({ where: { id: fresh.senderWalletId }, select: { balance: true, status: true } })
                : null;
            if (!senderW) throw new NotFoundError("Sender wallet not found");
            if (senderW.status === "FROZEN") throw new ForbiddenError("Sender wallet is frozen; cannot override-settle");
            if (Number(senderW.balance) < amount) throw new BadRequestError("Sender has insufficient balance for override settlement");
            await tx.wallet.update({ where: { id: fresh.senderWalletId }, data: { balance: { decrement: amount } } });
            await tx.wallet.update({ where: { id: fresh.receiverWalletId }, data: { balance: { increment: amount } } });
            await tx.transaction.update({ where: { id: fresh.id }, data: { status: "COMPLETED", requiresReview: false, completedAt: new Date() } });
        } else if (fresh.status === "BLOCKED") {
            await tx.transaction.update({ where: { id: fresh.id }, data: { status: "REVERSED", requiresReview: false } });
        }
        const resolved = await tx.fraudAlert.update({
            where: { id: alertId },
            data: { status: finalStatus, reviewedBy: adminId, reviewNote: note ? String(note).slice(0, 500) : null, resolvedAt: new Date() },
        });
        const txnNow = await tx.transaction.findUnique({ where: { id: fresh.id }, select: { status: true } });
        return { resolved, txnStatus: txnNow.status };
    });
    await notify(a.userId, {
        type: "FRAUD_ALERT",
        title: want === "APPROVE" ? "Payment review approved" : "Payment review decision",
        message: `Your flagged payment ${txn.reference} was ${want === "APPROVE" ? "approved and released" : "rejected and reversed"} after review.`,
    });
    await recordSecurityEvent(a.userId, {
        type: "PAYMENT_VERIFIED",
        severity: want === "APPROVE" ? "INFO" : "WARNING",
        message: `Flagged payment ${txn.reference} ${want === "APPROVE" ? "approved" : "rejected"} by review.`,
        ipAddress: client.ip || null,
    });
    await audit({
        userId: adminId, actorRole: "ADMIN", action: want === "APPROVE" ? "FRAUD_ALERT_APPROVE" : "FRAUD_ALERT_REJECT",
        entity: "FraudAlert", entityId: alertId, result: "SUCCESS", ipAddress: client.ip || null,
        metadata: { transactionId: txn.id, reference: txn.reference, txnStatus: result.txnStatus, note: note || null },
    });
    return { id: result.resolved.id, status: result.resolved.status, transactionStatus: result.txnStatus, reviewedBy: adminId };
}

/** Global user directory (identity + wallet state, never secrets). */
export async function listUsers(query = {}) {
    const { page, pageSize } = parsePage(query);
    const where = {};
    if (query.search) {
        const q = String(query.search).trim();
        if (q) {
            where.OR = [
                { username: { contains: q.toLowerCase() } },
                { email: { contains: q.toLowerCase() } },
                { fullName: { contains: q, mode: "insensitive" } },
                { nexaId: { equals: q.toUpperCase() } },
            ];
        }
    }
    const st = String(query.status || "").toUpperCase();
    if (st && ["ACTIVE", "LOCKED", "SUSPENDED", "PENDING_VERIFICATION"].includes(st)) where.status = st;
    const rl = String(query.role || "").toUpperCase();
    if (rl && ["USER", "ADMIN"].includes(rl)) where.role = rl;
    const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true, nexaId: true, username: true, email: true, phone: true, fullName: true,
                role: true, status: true, emailVerified: true, failedLoginAttempts: true,
                lastLoginAt: true, createdAt: true,
                wallet: { select: { status: true, balance: true, pendingBalance: true } },
            },
        }),
    ]);
    const items = rows.map((u) => ({
        id: u.id, nexaId: u.nexaId, username: u.username, email: u.email, phone: u.phone,
        fullName: u.fullName, role: u.role, status: u.status, emailVerified: u.emailVerified,
        failedLoginAttempts: u.failedLoginAttempts, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
        wallet: u.wallet ? { status: u.wallet.status, balance: toNumber(u.wallet.balance), pendingBalance: toNumber(u.wallet.pendingBalance) } : null,
    }));
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** One user's admin dossier (identity, wallet, ledger, alerts, sessions). */
export async function getUserDetail(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true, nexaId: true, username: true, email: true, phone: true, fullName: true,
            role: true, status: true, emailVerified: true, failedLoginAttempts: true,
            lockedUntil: true, lastLoginAt: true, createdAt: true,
            wallet: { select: { id: true, status: true, balance: true, pendingBalance: true, currency: true, frozenAt: true, frozenReason: true } },
            twoFactor: { select: { enabled: true, confirmedAt: true } },
        },
    });
    if (!user) throw new NotFoundError("User not found");
    const [recentTxns, alerts, sessions, eventCount] = await Promise.all([
        prisma.transaction.findMany({
            where: { OR: [{ senderId: userId }, { receiverId: userId }] },
            orderBy: { createdAt: "desc" }, take: 10,
            select: { id: true, reference: true, type: true, status: true, amount: true, currency: true, createdAt: true },
        }),
        prisma.fraudAlert.findMany({
            where: { userId }, orderBy: { createdAt: "desc" }, take: 10,
            select: { id: true, transactionId: true, riskScore: true, riskLevel: true, status: true, createdAt: true },
        }),
        prisma.userSession.findMany({
            where: { userId, revoked: false, expiresAt: { gt: new Date() } },
            orderBy: { lastActiveAt: "desc" }, take: 10,
            select: { id: true, deviceLabel: true, deviceId: true, ipAddress: true, lastActiveAt: true, createdAt: true },
        }),
        prisma.securityEvent.count({ where: { userId } }),
    ]);
    return {
        user: {
            id: user.id, nexaId: user.nexaId, username: user.username, email: user.email,
            phone: user.phone, fullName: user.fullName, role: user.role, status: user.status,
            emailVerified: user.emailVerified, failedLoginAttempts: user.failedLoginAttempts,
            lockedUntil: user.lockedUntil, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
        },
        wallet: user.wallet ? { ...user.wallet, balance: toNumber(user.wallet.balance), pendingBalance: toNumber(user.wallet.pendingBalance) } : null,
        twoFactorEnabled: !!user.twoFactor?.enabled,
        recentTransactions: recentTxns.map((t) => ({ ...t, amount: toNumber(t.amount) })),
        fraudAlerts: alerts,
        activeSessions: sessions,
        securityEventCount: eventCount,
    };
}

/** Suspend / reactivate a user account (self + admin-guard). */
export async function setUserStatus(adminId, userId, { status }, client = {}) {
    const want = String(status || "").toUpperCase();
    if (!["ACTIVE", "SUSPENDED"].includes(want)) throw new BadRequestError("status must be ACTIVE or SUSPENDED");
    if (userId === adminId) throw new BadRequestError("You cannot change your own status");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, role: true, username: true } });
    if (!user) throw new NotFoundError("User not found");
    if (user.role === "ADMIN" && want === "SUSPENDED") throw new ForbiddenError("Admin accounts cannot be suspended");
    const updated = await prisma.user.update({
        where: { id: userId },
        data: { status: want, ...(want === "ACTIVE" ? { failedLoginAttempts: 0, lockedUntil: null } : {}) },
    });
    if (want === "SUSPENDED") {
        const { revokeAllSessions } = await import("./session.service.js");
        await revokeAllSessions(userId);
    }
    await recordSecurityEvent(userId, {
        type: "ACCOUNT_LOCKED",
        severity: want === "SUSPENDED" ? "CRITICAL" : "WARNING",
        message: want === "SUSPENDED" ? "Account suspended by NEXA review team." : "Account reactivated by NEXA review team.",
        ipAddress: client.ip || null,
    });
    await audit({
        userId: adminId, actorRole: "ADMIN", action: want === "SUSPENDED" ? "ADMIN_USER_SUSPEND" : "ADMIN_USER_REACTIVATE",
        entity: "User", entityId: userId, result: "SUCCESS", ipAddress: client.ip || null,
        metadata: { username: user.username, from: user.status, to: want },
    });
    return { id: updated.id, username: updated.username, status: updated.status };
}

/** Immutable audit trail with action/actor/result filters. */
export async function listAuditLogs(query = {}) {
    const { page, pageSize } = parsePage(query);
    const where = {};
    if (query.action) where.action = { contains: String(query.action), mode: "insensitive" };
    if (query.userId) where.userId = String(query.userId);
    const rl = String(query.actorRole || "").toUpperCase();
    if (rl && ["USER", "ADMIN"].includes(rl)) where.actorRole = rl;
    if (query.result) where.result = { contains: String(query.result), mode: "insensitive" };
    if (query.since) {
        const d = new Date(query.since);
        if (!Number.isNaN(d.getTime())) where.createdAt = { gte: d };
    }
    const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { user: { select: { username: true, nexaId: true, fullName: true } } },
        }),
    ]);
    const items = rows.map((l) => ({
        id: l.id, userId: l.userId, actor: l.user ? { username: l.user.username, nexaId: l.user.nexaId, fullName: l.user.fullName } : null,
        actorRole: l.actorRole, action: l.action, entity: l.entity, entityId: l.entityId,
        result: l.result, metadata: l.metadata, ipAddress: l.ipAddress, createdAt: l.createdAt,
    }));
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export default {
    getQueueStats, listFlaggedTransactions, listAllAlerts, getAlertDetail,
    claimAlert, resolveAlert, listUsers, getUserDetail, setUserStatus, listAuditLogs,
};



