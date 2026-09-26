import prisma from "../../config/prisma.js";
import { evaluatePayment, BLOCK_THRESHOLD, REVIEW_THRESHOLD } from "./rules.js";

/**
 * NEXA Wallet — fraud orchestration service (Phase 5).
 * Scores every SEND, persists the RiskAssessment trail row, and
 * enforces the three-way decision: ALLOW / REVIEW / BLOCK.
 */

export { BLOCK_THRESHOLD, REVIEW_THRESHOLD };

/**
 * Gather the signals `rules.evaluatePayment` needs for a P2P send.
 * Everything is read-only; the caller decides inside its own DB txn.
 */
export async function buildSendContext({ senderId, amount, recipientUserId, client = {} }) {
    const window15m = new Date(Date.now() - 15 * 60 * 1000);
    const window24h = new Date(Date.now() - 24 * 3600 * 1000);
    const [beneficiary, recentCount15m, dayRows, sender, deviceSeen] = await Promise.all([
        prisma.beneficiary.findFirst({
            where: { userId: senderId, beneficiaryUserId: recipientUserId },
            select: { transactionCount: true },
        }),
        prisma.transaction.count({
            where: { senderId, type: "SEND", status: "COMPLETED", createdAt: { gte: window15m } },
        }),
        prisma.transaction.findMany({
            where: { senderId, type: "SEND", status: "COMPLETED", createdAt: { gte: window24h } },
            select: { amount: true },
        }),
        prisma.user.findUnique({
            where: { id: senderId },
            select: { emailVerified: true, createdAt: true },
        }),
        client?.deviceId
            ? prisma.userSession.findFirst({ where: { userId: senderId, deviceId: client.deviceId }, select: { id: true } })
            : Promise.resolve(null),
    ]);
    const dayTotal = dayRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    return {
        amount: Number(amount),
        recipientTxnCount: beneficiary?.transactionCount ?? 0,
        sender,
        recentCount15m,
        dayCount: dayRows.length,
        dayTotal,
        isNewDevice: Boolean(client?.deviceId) && !deviceSeen,
        now: new Date(),
    };
}

/** Score a send context (thin wrapper so callers don't import rules). */
export function scoreSend(context) {
    return evaluatePayment(context);
}

function toPrismaLevel(level) {
    return level === "HIGH" ? "HIGH" : level === "MEDIUM" ? "MEDIUM" : "LOW";
}

/**
 * Persist the decision trail INSIDE the caller's transaction (`tx`):
 * TransactionRisk row always; FraudAlert row when REVIEW or BLOCK.
 * Returns { riskId, alertId }.
 */
export async function persistDecision(tx, { transactionId, userId, assessment, context = null }) {
    const risk = await tx.transactionRisk.create({
        data: {
            transactionId,
            riskScore: assessment.score,
            riskLevel: toPrismaLevel(assessment.level),
            factors: assessment.factors,
            recommendation: assessment.recommendation,
            engineVersion: "rules-v1",
            featureVector: context
                ? {
                      amount: context.amount ?? null,
                      recipientTxnCount: context.recipientTxnCount ?? null,
                      recentCount15m: context.recentCount15m ?? null,
                      dayCount: context.dayCount ?? null,
                      dayTotal: context.dayTotal ?? null,
                      isNewDevice: context.isNewDevice ?? null,
                      hour: context.now instanceof Date ? context.now.getHours() : null,
                  }
                : undefined,
        },
    });
    let alertId = null;
    if (assessment.decision === "REVIEW" || assessment.decision === "BLOCK") {
        const alert = await tx.fraudAlert.create({
            data: {
                transactionId,
                userId,
                riskScore: assessment.score,
                riskLevel: toPrismaLevel(assessment.level),
                factors: assessment.factors,
                status: "OPEN",
            },
        });
        alertId = alert.id;
    }
    return { riskId: risk.id, alertId };
}

/** Human summary line stored on notifications / security events. */
export function explainAssessment(assessment) {
    const top = assessment.factors
        .slice()
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .map((f) => `${f.code} (+${f.points})`)
        .join(", ");
    return `Risk ${assessment.score}/100 (${assessment.level}, ${assessment.decision})${top ? ` — ${top}` : ""}`;
}

export default { buildSendContext, scoreSend, persistDecision, explainAssessment, BLOCK_THRESHOLD, REVIEW_THRESHOLD };
