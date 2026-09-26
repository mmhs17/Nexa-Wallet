import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";
import { resolvePeriod, getSummary, getInsights } from "./analytics.service.js";
import { getOverview } from "./security-center.service.js";
import { listAssessments, listAlerts } from "./fraud.service.js";
import { audit } from "./audit.service.js";
import { notify } from "./security.service.js";

/**
 * NEXA Wallet — NEXA Intelligence Assistant (Phase 9).
 *
 * An explainable finance assistant that reasons over the user's own
 * ledger, fraud assessments, and Security Center posture — then answers
 * in natural language via OpenRouter (Gemini 2.0 Flash).
 *
 * Every response is grounded in data the user owns; the assistant never
 * sees other users' data. Falls back to rule-based responses when the AI
 * key is absent so the feature is always live.
 */

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * Gather all explainable context the assistant needs to answer a question
 * about the signed-in user's wallet. Every call is ownership-gated.
 */
async function gatherContext(userId) {
    const period = resolvePeriod({ period: "30d" });
    const [user, wallet, twoFa, privacy, summary, insights, security, assessments, alerts, recent] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, nexaId: true, username: true, email: true, fullName: true, emailVerified: true, role: true, createdAt: true, lastLoginAt: true },
        }),
        prisma.wallet.findUnique({ where: { userId }, select: { balance: true, pendingBalance: true, status: true, frozenAt: true, frozenReason: true } }),
        prisma.twoFactorAuth.findUnique({ where: { userId }, select: { enabled: true, confirmedAt: true } }),
        prisma.privacySettings.findUnique({ where: { userId }, select: { shieldActive: true, hideBalance: true, hideTransactionAmounts: true, hideRecipientNames: true } }),
        getSummary(userId, period),
        getInsights(userId, period),
        getOverview(userId, null),
        listAssessments(userId, { page: 1, pageSize: 10 }),
        listAlerts(userId, { page: 1, pageSize: 10 }),
        prisma.transaction.findMany({
            where: { OR: [{ senderId: userId }, { receiverId: userId }], status: "COMPLETED" },
            orderBy: { createdAt: "desc" }, take: 10,
            select: {
                reference: true, type: true, status: true, amount: true, currency: true,
                senderId: true, receiverId: true,
                sender: { select: { username: true, fullName: true } },
                receiver: { select: { username: true, fullName: true } },
                category: { select: { name: true, slug: true } },
                risk: { select: { riskScore: true, riskLevel: true } },
                createdAt: true, completedAt: true,
            },
        }),
    ]);

    // Viewer-relative direction for each recent transaction.
    const recentTxns = recent.map((t) => {
        const isSender = String(t.senderId) === String(userId);
        const direction = isSender ? "DEBIT" : "CREDIT";
        const counterparty = direction === "CREDIT" ? t.sender : t.receiver;
        return {
            reference: t.reference, type: t.type, direction,
            amount: Number(t.amount), currency: t.currency,
            counterparty: counterparty ? { username: counterparty.username, fullName: counterparty.fullName } : null,
            category: t.category,
            riskScore: t.risk?.riskScore ?? null, riskLevel: t.risk?.riskLevel ?? null,
            createdAt: t.createdAt,
        };
    });

        const openAlerts = alerts.items.filter((a) => a.status === "OPEN" || a.status === "REVIEWING");

    return {
        user: {
            nexaId: user?.nexaId, username: user?.username, fullName: user?.fullName,
            emailVerified: user?.emailVerified, role: user?.role,
            memberSince: user?.createdAt, lastLoginAt: user?.lastLoginAt,
        },
        wallet: {
            balance: wallet ? Number(wallet.balance) : 0,
            pendingBalance: wallet ? Number(wallet.pendingBalance) : 0,
            status: wallet?.status, frozen: wallet?.status === "FROZEN",
            frozenReason: wallet?.frozenReason,
        },
        twoFactor: { enabled: !!twoFa?.enabled, confirmedAt: twoFa?.confirmedAt ?? null },
        privacy: {
            shieldActive: privacy?.shieldActive, hideBalance: privacy?.hideBalance,
            hideTransactionAmounts: privacy?.hideTransactionAmounts,
            hideRecipientNames: privacy?.hideRecipientNames, hideAnalytics: privacy?.hideAnalytics,
        },
        analytics: {
            period: summary.period,
            moneyIn: summary.moneyIn, moneyOut: summary.moneyOut, net: summary.net,
            transactionCount: summary.transactionCount,
            topCategory: summary.topCategory
                ? { name: summary.topCategory.name, total: summary.topCategory.total, share: summary.topCategory.share }
                : null,
            topCounterparty: summary.topCounterparty
                ? { fullName: summary.topCounterparty.fullName, username: summary.topCounterparty.username, total: summary.topCounterparty.total }
                : null,
        },
        recentTransactions: recentTxns,
        insights: insights.insights,
        fraud: {
            openAlerts: openAlerts.map((a) => ({
                id: a.id, transactionId: a.transactionId, score: a.score, level: a.level,
                status: a.status, factors: a.factors,
            })),
            recentAssessments: assessments.items.map((a) => ({
                reference: a.reference, type: a.type, score: a.score, level: a.level,
                decision: a.decision, evaluatedAt: a.evaluatedAt,
            })),
        },
        security: {
            posture: security?.posture?.score ?? 0,
            postureLevel: security?.posture?.level ?? "AT_RISK",
            walletStatus: security?.posture ? null : wallet?.status,
            unreadNotifications: security?.notifications?.unread ?? 0,
        },
    };
}

/**
 * Build the system prompt that grounds the assistant in NEXA Wallet context.
 * The prompt is explainable and explicit about what data the assistant can see.
 */
function buildSystemPrompt(ctx) {
    const recentList = ctx.recentTransactions
        .map((t) => `  • ${t.direction} ${inr(t.amount)} ${t.type}${t.counterparty ? ` to/from ${t.counterparty.fullName}` : ""}${t.category ? ` (${t.category.name})` : ""}${t.riskScore ? ` [risk ${t.riskScore}]` : ""}`)
        .join("\n") || "  (none)";

    const alertList = ctx.fraud.openAlerts
        .map((a) => `  • Alert #${a.id.slice(-6)} score=${a.score} level=${a.level} status=${a.status} factors=${a.factors.map((f) => `${f.code}(+${f.points})`).join(", ")}`)
        .join("\n") || "  none";

    return `You are NEXA, a finance assistant built into the NEXA Wallet app ("Pay Smart. Stay Protected.").
You are explainable and never invent data — you answer only from the context provided.

User context:
- NEXA ID: ${ctx.user.nexaId}
- Name: ${ctx.user.fullName}
- Email verified: ${ctx.user.emailVerified ? "yes" : "no"}
- Member since: ${ctx.user.memberSince ? new Date(ctx.user.memberSince).toLocaleDateString() : "unknown"}

Wallet:
- Balance: ${ctx.wallet.frozen ? "FROZEN" : inr(ctx.wallet.balance)} (${ctx.wallet.status})
- Pending: ${inr(ctx.wallet.pendingBalance)}

30-day summary:
- Money in: ${inr(ctx.analytics.moneyIn)} | Money out: ${inr(ctx.analytics.moneyOut)} | Net: ${ctx.analytics.net >= 0 ? "+" : ""}${inr(ctx.analytics.net)}
- ${ctx.analytics.transactionCount} completed transactions
- Top category: ${ctx.analytics.topCategory ? `${ctx.analytics.topCategory.name} (${inr(ctx.analytics.topCategory.total)}, ${ctx.analytics.topCategory.share}% of outflow)` : "none"}
- Top counterparty: ${ctx.analytics.topCounterparty ? `${ctx.analytics.topCounterparty.fullName} (${inr(ctx.analytics.topCounterparty.total)})` : "none"}

Security:
- Posture score: ${ctx.security.posture}/100 (${ctx.security.postureLevel})
- 2FA: ${ctx.twoFactor.enabled ? "enabled" : "NOT enabled"}
- Privacy Shield: ${ctx.privacy.shieldActive ? "active" : "inactive"}
- Open fraud alerts: ${ctx.fraud.openAlerts.length}

Recent transactions (last 10):
${recentList}

Open fraud alerts:
${alertList}

Insights:
${ctx.insights.map((i) => `  • ${i.title}: ${i.detail}`).join("\n") || "  (no specific insights)"}

Guidelines:
- Keep answers short and human. Use ₹ and INR naturally.
- Quote numbers from context for accuracy. Point to transaction references for specific txns.
- If you cannot answer from context, say so and suggest the Fraud Intelligence or Security Center page.
- Never reveal raw internal IDs, secret keys, or other users' data.
- Recommend enabling 2FA if not active.`;
}



/**
 * Call the OpenRouter chat completions API (OpenAI-compatible format).
 * Uses native fetch (Node 18+). Falls back to rule-based responses when
 * no API key is configured or the upstream call fails.
 */
async function callOpenRouter(systemPrompt, userMessage) {
    if (!env.openRouter.apiKey) {
        return fallbackResponse(userMessage);
    }

    let resp;
    try {
        resp = await fetch(`${env.openRouter.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.openRouter.apiKey}`,
                "HTTP-Referer": "https://nexa.wallet",
                "X-Title": "NEXA Wallet Intelligence",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: env.openRouter.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                temperature: 0.7,
                max_tokens: 1500,
            }),
            signal: AbortSignal.timeout(12_000),
        });
    } catch {
        return fallbackResponse(userMessage);
    }

    if (!resp.ok) {
        // API error (e.g. invalid model ID, rate limit) — fall back to rules
        // so the assistant is always available, even in sandbox mode.
        return fallbackResponse(userMessage);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        return fallbackResponse(userMessage);
    }

    return {
        reply: content.trim(),
        usage: {
            promptTokens: data.usage?.prompt_tokens ?? null,
            completionTokens: data.usage?.completion_tokens ?? null,
            totalTokens: data.usage?.total_tokens ?? null,
        },
        model: data.model ?? env.openRouter.model,
    };
}

/**
 * Deterministic fallback used when no API key is configured or the
 * upstream call fails. Keeps the feature alive in pure-sandbox mode.
 */
function fallbackResponse(userMessage) {
    const msg = String(userMessage || "").toLowerCase();
    let reply = "";

    if (msg.includes("balance")) {
        reply = "I can see your wallet balance in the context panel, but NEXA Intelligence is running in sandbox mode without an AI provider key. Connect an OpenRouter key in the Security Center for full conversational assistance.";
    } else if (msg.includes("fraud") || msg.includes("risk") || msg.includes("alert") || msg.includes("scor")) {
        reply = "NEXA's rule engine scans every payment for 9 risk signals: new recipient + large amount, large-amount bands, round-figure amounts, rapid succession (3+ sends in 15 min), late-night activity (00:00-05:00), unverified email, fresh account (<24h), daily velocity (5+ sends or 100k+), and new device. Scores >= 85 BLOCK, 60-84 REVIEW, below 60 ALLOW.";
    } else if (msg.includes("security") || msg.includes("2fa") || msg.includes("2-fa") || msg.includes("posture")) {
        reply = "Your Security Center posture is scored 100 points: 2FA (30 pts), verified email (15 pts), no open fraud alerts (20 pts), no failed logins in 24h (20 pts), wallet not frozen (15 pts). Enable 2FA for the biggest posture boost.";
    } else if (msg.includes("spend") || msg.includes("analytics") || msg.includes("trend")) {
        reply = "The Financial Analytics page gives you spending breakdowns by category, top counterparties, and time-bucketed trends. It compares each period to the previous window and surfaces explainable insights like rising spend, top category concentration, or net-negative cash flow.";
    } else {
        reply = "NEXA Intelligence is running in sandbox mode. Connect an OpenRouter API key to enable full conversational finance assistance. Meanwhile, the Financial Analytics, Fraud Intelligence, and Security Center pages provide explainable insights.";
    }

    return { reply, usage: null, model: "rules-fallback" };
}

/**
 * Main chat entry point: gather context → call the AI → record the exchange.
 */
export async function chat(userId, message, client = {}) {
    if (!message || String(message).trim().length === 0) {
        throw new BadRequestError("Message is required");
    }
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, emailVerified: true },
    });
    if (!user) throw new NotFoundError("User not found");

    const context = await gatherContext(userId);
    const systemPrompt = buildSystemPrompt(context);
    const userMessage = String(message).trim();

    const result = await callOpenRouter(systemPrompt, userMessage);

    await audit({
        userId,
        actorRole: "USER",
        action: "INTELLIGENCE_CHAT",
        entity: "Intelligence",
        entityId: userId,
        result: "SUCCESS",
        metadata: {
            messageLength: userMessage.length,
            model: result.model,
            usage: result.usage ? { total: result.usage.totalTokens } : null,
        },
        ipAddress: client.ip || null,
    });

    if (result.model !== "rules-fallback") {
        await notify(userId, {
            type: "SYSTEM",
            title: "NEXA Intelligence responded",
            message: `${userMessage.slice(0, 60)}${".".repeat(Math.min(1, userMessage.length))} ${result.reply.slice(0, 120)}`,
        });
    }

    return {
        reply: result.reply,
        model: result.model,
        usage: result.usage,
        context,
    };
}

/** GET-friendly view of the gathered context (transparency / debugging). */
export async function getContext(userId) {
    const context = await gatherContext(userId);
    return context;
}

export default { chat, getContext, gatherContext };
