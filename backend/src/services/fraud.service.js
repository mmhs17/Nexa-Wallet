import prisma from "../config/prisma.js";
import { NotFoundError } from "../utils/errors.js";
import { assertTransactionVisible } from "./transaction.service.js";
import { buildSendContext, scoreSend, explainAssessment, BLOCK_THRESHOLD, REVIEW_THRESHOLD } from "./fraud-engine/fraud.service.js";
import { resolveRecipient } from "./wallet.service.js";

/**
 * NEXA Wallet — user-facing Explainable Fraud Intelligence (Phase 5).
 * Pre-flight scoring before a send, plus every risk assessment and
 * fraud alert the user owns — each with human-readable factors.
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

function parsePage(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.pageSize ?? query.limit, 10) || PAGE_SIZE_DEFAULT));
    return { page, pageSize };
}

function decisionFor(score) {
    return score >= BLOCK_THRESHOLD ? "BLOCK" : score >= REVIEW_THRESHOLD ? "REVIEW" : "ALLOW";
}

/**
 * Score a prospective payment WITHOUT moving money or writing rows.
 * Mirrors the exact engine path used by wallet.sendMoney, so the
 * pre-flight score always matches what a real send would produce.
 */
export async function preflight(userId, { to, amount }, client = {}) {
    const recipient = await resolveRecipient(to, userId);
    const value = Number(amount);
    const context = await buildSendContext({ senderId: userId, amount: value, recipientUserId: recipient.id, client });
    const assessment = scoreSend(context);
    return {
        to: { nexaId: recipient.nexaId, username: recipient.username, fullName: recipient.fullName },
        amount: value,
        score: assessment.score,
        level: assessment.level,
        decision: assessment.decision,
        recommendation: assessment.recommendation,
        summary: explainAssessment(assessment),
        factors: assessment.factors,
        thresholds: { blockAt: BLOCK_THRESHOLD, reviewAt: REVIEW_THRESHOLD },
        evaluatedAt: context.now.toISOString(),
    };
}

/** Explainable risk assessment for one owned transaction. */
export async function getAssessmentForTransaction(userId, transactionId) {
    await assertTransactionVisible(userId, transactionId);
    const risk = await prisma.transactionRisk.findUnique({
        where: { transactionId },
        include: {
            transaction: { select: { reference: true, type: true, status: true, amount: true, currency: true, createdAt: true } },
        },
    });
    if (!risk) throw new NotFoundError("No risk assessment recorded for this transaction");
    return {
        transaction: {
            id: risk.transactionId,
            reference: risk.transaction.reference,
            type: risk.transaction.type,
            status: risk.transaction.status,
            amount: Number(risk.transaction.amount),
            currency: risk.transaction.currency,
            createdAt: risk.transaction.createdAt,
        },
        score: risk.riskScore,
        level: risk.riskLevel,
        decision: decisionFor(risk.riskScore),
        factors: risk.factors,
        recommendation: risk.recommendation,
        engineVersion: risk.engineVersion,
        featureVector: risk.featureVector ?? null,
        evaluatedAt: risk.createdAt,
    };
}

/** Paginated risk-assessment history for the signed-in user's sends. */
export async function listAssessments(userId, query = {}) {
    const { page, pageSize } = parsePage(query);
    const where = { transaction: { OR: [{ senderId: userId }, { receiverId: userId }] } };
    const [total, rows] = await Promise.all([
        prisma.transactionRisk.count({ where }),
        prisma.transactionRisk.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                transaction: {
                    select: { reference: true, type: true, status: true, amount: true, currency: true, senderId: true, receiverId: true },
                },
            },
        }),
    ]);
    const items = rows.map((r) => ({
        transactionId: r.transactionId,
        reference: r.transaction.reference,
        type: r.transaction.type,
        status: r.transaction.status,
        amount: Number(r.transaction.amount),
        currency: r.transaction.currency,
        direction: String(r.transaction.senderId) === String(userId) ? "DEBIT" : "CREDIT",
        score: r.riskScore,
        level: r.riskLevel,
        decision: decisionFor(r.riskScore),
        factors: r.factors,
        engineVersion: r.engineVersion,
        evaluatedAt: r.createdAt,
    }));
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Paginated fraud alerts for the signed-in user (newest first). */
export async function listAlerts(userId, query = {}) {
    const { page, pageSize } = parsePage(query);
    const statusFilter = ["OPEN", "REVIEWING", "RESOLVED_APPROVED", "RESOLVED_REJECTED"].includes(String(query.status || "").toUpperCase())
        ? String(query.status).toUpperCase()
        : null;
    const where = { userId, ...(statusFilter ? { status: statusFilter } : {}) };
    const [total, rows] = await Promise.all([
        prisma.fraudAlert.count({ where }),
        prisma.fraudAlert.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                transaction: { select: { reference: true, type: true, status: true, amount: true, currency: true } },
            },
        }),
    ]);
    const items = rows.map((a) => ({
        id: a.id,
        transactionId: a.transactionId,
        reference: a.transaction.reference,
        type: a.transaction.type,
        transactionStatus: a.transaction.status,
        amount: Number(a.transaction.amount),
        currency: a.transaction.currency,
        score: a.riskScore,
        level: a.riskLevel,
        factors: a.factors,
        status: a.status,
        reviewedBy: a.reviewedBy,
        reviewNote: a.reviewNote,
        resolvedAt: a.resolvedAt,
        createdAt: a.createdAt,
    }));
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export default { preflight, getAssessmentForTransaction, listAssessments, listAlerts };
