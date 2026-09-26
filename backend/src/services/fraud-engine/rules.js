/**
 * NEXA Wallet — Explainable Fraud Intelligence (Phase 5).
 * Pure rule engine, no ML: every rule emits a human-readable factor
 * { code, points, detail } so the score is fully explainable.
 *
 * Decision bands (shared with fraud.service):
 *   score >= 85            -> BLOCK     (402 PAYMENT_BLOCKED)
 *   60 <= score < 85       -> REVIEW    (txn UNDER_REVIEW + FraudAlert OPEN)
 *   score < 60             -> ALLOW     (normal COMPLETED flow)
 */

export const BLOCK_THRESHOLD = 85;
export const REVIEW_THRESHOLD = 60;

export const RULE_CODES = Object.freeze({
    NEW_RECIPIENT_LARGE: "NEW_RECIPIENT_LARGE",
    LARGE_AMOUNT: "LARGE_AMOUNT",
    ROUND_AMOUNT: "ROUND_AMOUNT",
    RAPID_SUCCESSION: "RAPID_SUCCESSION",
    LATE_NIGHT: "LATE_NIGHT",
    UNVERIFIED_ACCOUNT: "UNVERIFIED_ACCOUNT",
    FRESH_ACCOUNT: "FRESH_ACCOUNT",
    HIGH_VELOCITY_DAY: "HIGH_VELOCITY_DAY",
    NEW_DEVICE: "NEW_DEVICE",
});

function inr(n) {
    return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

/**
 * Evaluate a payment context into { score, level, factors, decision }.
 * ctx: { amount, recipientTxnCount, sender: { emailVerified, createdAt },
 *        recentCount15m, dayTotal, dayCount, isNewDevice, now }
 */
export function evaluatePayment(ctx = {}) {
    const factors = [];
    const push = (code, points, detail) => {
        if (points > 0) factors.push({ code, points, detail });
    };

    const amount = Number(ctx.amount || 0);
    const recipientTxnCount = Number(ctx.recipientTxnCount ?? 0);
    const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
    const hour = now.getHours();

    // 1. First-ever transfer to this recipient + large value.
    if (recipientTxnCount === 0 && amount >= 10000) {
        push(RULE_CODES.NEW_RECIPIENT_LARGE, 30, `First payment to this recipient of ${inr(amount)}`);
    }
    // 2. Absolute large-amount bands (stacked gently: only the top band fires).
    if (amount >= 100000) push(RULE_CODES.LARGE_AMOUNT, 30, `${inr(amount)} exceeds ${inr(100000)} single-payment band`);
    else if (amount >= 50000) push(RULE_CODES.LARGE_AMOUNT, 20, `${inr(amount)} exceeds ${inr(50000)} single-payment band`);
    else if (amount >= 25000) push(RULE_CODES.LARGE_AMOUNT, 10, `${inr(amount)} exceeds ${inr(25000)} single-payment band`);
    // 3. Round-number amounts (classic mule pattern) — only for ≥ ₹1,000.
    if (amount >= 1000 && amount % 1000 === 0) {
        push(RULE_CODES.ROUND_AMOUNT, 10, `${inr(amount)} is an exact round figure`);
    }
    // 4. Rapid succession: 3+ completed sends in the trailing 15 minutes.
    const recent = Number(ctx.recentCount15m || 0);
    if (recent >= 3) {
        push(RULE_CODES.RAPID_SUCCESSION, 20, `${recent} payments in the last 15 minutes`);
    }
    // 5. Late-night window (00:00–04:59 local server time).
    if (hour >= 0 && hour < 5) {
        push(RULE_CODES.LATE_NIGHT, 10, `Initiated at ${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (late-night window)`);
    }
    // 6. Sender email not verified.
    if (ctx.sender && ctx.sender.emailVerified === false) {
        push(RULE_CODES.UNVERIFIED_ACCOUNT, 10, "Sender email address is not verified");
    }
    // 7. Fresh account (< 24h old).
    if (ctx.sender?.createdAt) {
        const ageMs = now.getTime() - new Date(ctx.sender.createdAt).getTime();
        if (ageMs >= 0 && ageMs < 24 * 3600 * 1000) {
            push(RULE_CODES.FRESH_ACCOUNT, 15, "Sender account is less than 24 hours old");
        }
    }
    // 8. High daily velocity: 5+ completed sends or ₹1L+ moved today.
    const dayCount = Number(ctx.dayCount || 0);
    const dayTotal = Number(ctx.dayTotal || 0);
    if (dayCount >= 5 || dayTotal >= 100000) {
        push(
            RULE_CODES.HIGH_VELOCITY_DAY,
            15,
            `${dayCount} payments totalling ${inr(dayTotal)} in the last 24 hours`
        );
    }
    // 9. Unrecognised device (no prior UserSession with this deviceId).
    if (ctx.isNewDevice) {
        push(RULE_CODES.NEW_DEVICE, 15, "Payment initiated from an unrecognised device");
    }

    const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
    const level = score >= BLOCK_THRESHOLD ? "HIGH" : score >= REVIEW_THRESHOLD ? "MEDIUM" : "LOW";
    const decision = score >= BLOCK_THRESHOLD ? "BLOCK" : score >= REVIEW_THRESHOLD ? "REVIEW" : "ALLOW";
    const recommendation =
        decision === "BLOCK"
            ? "Block the payment and raise a fraud alert for review."
            : decision === "REVIEW"
              ? "Hold the payment under review and notify the sender."
              : "Allow the payment; no elevated risk signals.";
    return { score, level, factors, decision, recommendation };
}

export function decisionForScore(score) {
    const s = Number(score || 0);
    return s >= BLOCK_THRESHOLD ? "BLOCK" : s >= REVIEW_THRESHOLD ? "REVIEW" : "ALLOW";
}

export default { evaluatePayment, decisionForScore, BLOCK_THRESHOLD, REVIEW_THRESHOLD, RULE_CODES };
