import prisma from "../config/prisma.js";

/**
 * NEXA Wallet — Financial Analytics service (Phase 8).
 * Reads the user's COMPLETED ledger only, ownership-gated, and computes
 * a summary, category/counterparty breakdowns, time-bucketed trends and
 * explainable insights. All money math in JS on Decimal -> Number rows.
 */

const PERIODS = {
    "7d": { days: 7, label: "Last 7 days" },
    "30d": { days: 30, label: "Last 30 days" },
    "90d": { days: 90, label: "Last 90 days" },
    "6m": { days: 182, label: "Last 6 months" },
    "1y": { days: 365, label: "Last 12 months" },
    all: { days: null, label: "All time" },
};

const DEBIT_TYPES = ["SEND", "WITHDRAW"];
const CREDIT_TYPES = ["RECEIVE", "ADD_MONEY", "REFUND"];

/** Resolve ?period=7d|30d|90d|6m|1y|all (default 30d) or explicit from/to. */
export function resolvePeriod(query = {}) {
    const key = PERIODS[String(query.period || "30d").toLowerCase()] ? String(query.period).toLowerCase() : "30d";
    const spec = PERIODS[key];
    const to = new Date();
    let from = null;
    if (query.from) {
        const d = new Date(query.from);
        if (!Number.isNaN(d.getTime())) from = d;
    } else if (spec.days) {
        from = new Date(to.getTime() - spec.days * 24 * 3600 * 1000);
    }
    const windowDays = from ? Math.max(1, Math.round((to - from) / (24 * 3600 * 1000))) : null;
    const prevFrom = from ? new Date(from.getTime() - windowDays * 24 * 3600 * 1000) : null;
    return { key, label: spec.label, from, to, prevFrom, prevTo: from };
}

function rowsWhere(viewerId, from, to) {
    const extra = [{ status: "COMPLETED" }];
    if (from && to) extra.push({ createdAt: { gte: from, lt: to } });
    else if (from) extra.push({ createdAt: { gte: from } });
    return { AND: [{ OR: [{ senderId: viewerId }, { receiverId: viewerId }] }, ...extra] };
}

async function fetchRows(viewerId, from, to) {
    return prisma.transaction.findMany({
        where: rowsWhere(viewerId, from, to),
        select: {
            type: true, amount: true, fee: true, createdAt: true,
            senderId: true, receiverId: true,
            sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
            receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
            category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
        },
        orderBy: { createdAt: "desc" },
    });
}

/** Viewer-relative split of one COMPLETED row into in/out buckets. */
function classify(row, viewerId) {
    const amount = Number(row.amount);
    const isReceiver = row.receiverId && String(row.receiverId) === String(viewerId);
    const isSender = row.senderId && String(row.senderId) === String(viewerId);
    // Money leaving this wallet: the viewer initiated a debit movement.
    if (isSender && !isReceiver && DEBIT_TYPES.includes(row.type)) {
        return { direction: "OUT", amount, counterparty: row.receiver, category: row.category, createdAt: row.createdAt, type: row.type };
    }
    // Money entering this wallet: viewer is the receiver of an inward movement.
    // A P2P transfer is stored as ONE SEND row shared by both parties, so the
    // receiver side counts it as IN — mirroring the ledger's `direction: CREDIT`.
    if (isReceiver && (CREDIT_TYPES.includes(row.type) || row.type === "SEND")) {
        return { direction: "IN", amount, counterparty: row.sender, category: row.category, createdAt: row.createdAt, type: row.type };
    }
    return null;
}

function pctDelta(current, previous) {
    if (previous === 0) return current === 0 ? 0 : null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

const r2 = (n) => Math.round(n * 100) / 100;

/** Headline summary for the window, with previous-period deltas. */
export async function getSummary(userId, period = {}) {
    const { label, from, to, prevFrom, prevTo } = period;
    const [rows, prevRows] = await Promise.all([
        fetchRows(userId, from, to),
        from ? fetchRows(userId, prevFrom, prevTo) : Promise.resolve([]),
    ]);
    const classified = rows.map((r) => classify(r, userId)).filter(Boolean);
    const prevClassified = prevRows.map((r) => classify(r, userId)).filter(Boolean);

    let moneyIn = 0, moneyOut = 0, inCount = 0, outCount = 0, sendTotal = 0, sendCount = 0;
    let biggest = null;
    const byCategory = new Map();
    const byCounterparty = new Map();

    for (const c of classified) {
        if (c.direction === "IN") { moneyIn += c.amount; inCount += 1; continue; }
        moneyOut += c.amount;
        outCount += 1;
        if (c.type === "SEND") { sendTotal += c.amount; sendCount += 1; }
        if (!biggest || c.amount > biggest.amount) biggest = c;
        const catKey = c.category ? c.category.id : "uncategorized";
        const cat = byCategory.get(catKey) || { category: c.category, total: 0, count: 0 };
        cat.total += c.amount; cat.count += 1;
        byCategory.set(catKey, cat);
        if (c.counterparty) {
            const cp = byCounterparty.get(c.counterparty.id) || { counterparty: c.counterparty, total: 0, count: 0 };
            cp.total += c.amount; cp.count += 1;
            byCounterparty.set(c.counterparty.id, cp);
        }
    }
    const prevOut = prevClassified.filter((c) => c.direction === "OUT").reduce((s, c) => s + c.amount, 0);
    const prevIn = prevClassified.filter((c) => c.direction === "IN").reduce((s, c) => s + c.amount, 0);

    const topCategoryEntry = [...byCategory.values()].sort((a, b) => b.total - a.total)[0] || null;
    const topCounterpartyEntry = [...byCounterparty.values()].sort((a, b) => b.total - a.total)[0] || null;

    return {
        period: { key: period.key, label, from, to },
        moneyIn: r2(moneyIn),
        moneyOut: r2(moneyOut),
        net: r2(moneyIn - moneyOut),
        transactionCount: inCount + outCount,
        inCount,
        outCount,
        averageSend: sendCount > 0 ? r2(sendTotal / sendCount) : 0,
        biggestDebit: biggest
            ? {
                  amount: biggest.amount, type: biggest.type, at: biggest.createdAt,
                  counterparty: biggest.counterparty
                      ? { username: biggest.counterparty.username, fullName: biggest.counterparty.fullName, nexaId: biggest.counterparty.nexaId }
                      : null,
              }
            : null,
        topCategory: topCategoryEntry
            ? {
                  name: topCategoryEntry.category ? topCategoryEntry.category.name : "Uncategorized",
                  total: r2(topCategoryEntry.total), count: topCategoryEntry.count,
                  share: moneyOut > 0 ? Math.round((topCategoryEntry.total / moneyOut) * 1000) / 10 : 0,
              }
            : null,
        topCounterparty: topCounterpartyEntry
            ? {
                  username: topCounterpartyEntry.counterparty.username,
                  fullName: topCounterpartyEntry.counterparty.fullName,
                  nexaId: topCounterpartyEntry.counterparty.nexaId,
                  total: r2(topCounterpartyEntry.total), count: topCounterpartyEntry.count,
              }
            : null,
        deltas: {
            moneyOut: { previous: r2(prevOut), changePct: pctDelta(moneyOut, prevOut) },
            moneyIn: { previous: r2(prevIn), changePct: pctDelta(moneyIn, prevIn) },
        },
    };
}


/** Category breakdown of debits in the window (share of total out). */
export async function getCategoryBreakdown(userId, period = {}) {
    const { from, to } = period;
    const rows = await fetchRows(userId, from, to);
    const byCategory = new Map();
    let totalOut = 0;
    for (const c of rows.map((r) => classify(r, userId)).filter(Boolean)) {
        if (c.direction !== "OUT") continue;
        totalOut += c.amount;
        const key = c.category ? c.category.id : "uncategorized";
        const cat = byCategory.get(key) || { category: c.category, total: 0, count: 0 };
        cat.total += c.amount; cat.count += 1;
        byCategory.set(key, cat);
    }
    const items = [...byCategory.values()]
        .sort((a, b) => b.total - a.total)
        .map((c) => ({
            category: c.category
                ? { id: c.category.id, name: c.category.name, slug: c.category.slug, icon: c.category.icon, color: c.category.color }
                : { id: "uncategorized", name: "Uncategorized", slug: "uncategorized", icon: "ellipsis", color: "#64748b" },
            total: r2(c.total), count: c.count,
            share: totalOut > 0 ? Math.round((c.total / totalOut) * 1000) / 10 : 0,
        }));
    return { period: { key: period.key, from, to }, totalOut: r2(totalOut), items };
}

/** Cumulative sent/received per counterparty in the window. */
export async function getCounterparties(userId, period = {}) {
    const { from, to } = period;
    const rows = await fetchRows(userId, from, to);
    const byCounterparty = new Map();
    for (const c of rows.map((r) => classify(r, userId)).filter(Boolean)) {
        if (!c.counterparty) continue;
        const cp = byCounterparty.get(c.counterparty.id) || { counterparty: c.counterparty, sent: 0, received: 0, count: 0 };
        if (c.direction === "OUT") cp.sent += c.amount;
        else cp.received += c.amount;
        cp.count += 1;
        byCounterparty.set(c.counterparty.id, cp);
    }
    const items = [...byCounterparty.values()]
        .sort((a, b) => b.sent - a.sent || b.received - a.received)
        .map((c) => ({
            username: c.counterparty.username, fullName: c.counterparty.fullName, nexaId: c.counterparty.nexaId,
            sent: r2(c.sent), received: r2(c.received), net: r2(c.received - c.sent), count: c.count,
        }));
    return { period: { key: period.key, from, to }, items };
}

/** Time-bucketed IN/OUT trend: day buckets (<=92d), week (<=366d), month. */
export async function getTrend(userId, period = {}) {
    const { from, to } = period;
    const rows = await fetchRows(userId, from, to);
    const spanDays = from ? Math.max(1, Math.round((to - from) / (24 * 3600 * 1000))) : 366;
    const bucket = spanDays <= 92 ? "day" : spanDays <= 366 ? "week" : "month";
    const keyOf = (d) => {
        const dt = new Date(d);
        if (bucket === "day") return dt.toISOString().slice(0, 10);
        if (bucket === "week") {
            const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
            t.setUTCDate(t.getUTCDate() - t.getUTCDay());
            return t.toISOString().slice(0, 10);
        }
        return dt.toISOString().slice(0, 7);
    };
    const buckets = new Map();
    for (const c of rows.map((r) => classify(r, userId)).filter(Boolean)) {
        const k = keyOf(c.createdAt);
        const b = buckets.get(k) || { bucket: k, moneyIn: 0, moneyOut: 0, count: 0 };
        if (c.direction === "IN") b.moneyIn += c.amount;
        else b.moneyOut += c.amount;
        b.count += 1;
        buckets.set(k, b);
    }
    const items = [...buckets.values()]
        .sort((a, b) => (a.bucket < b.bucket ? -1 : 1))
        .map((b) => ({ bucket: b.bucket, moneyIn: r2(b.moneyIn), moneyOut: r2(b.moneyOut), net: r2(b.moneyIn - b.moneyOut), count: b.count }));
    return { period: { key: period.key, from, to }, granularity: bucket, items };
}

/**
 * Explainable spending insights (same factor style as the fraud engine).
 * Rules read the window summary only — no ML, no surprises.
 */
export async function getInsights(userId, period = {}) {
    const summary = await getSummary(userId, period);
    const insights = [];
    const push = (code, level, title, detail) => insights.push({ code, level, title, detail });
    const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

    if (summary.transactionCount === 0) {
        push("NO_ACTIVITY", "neutral", "Quiet period", `No completed money movement in ${summary.period.label.toLowerCase()}.`);
    } else {
        const out = summary.deltas.moneyOut;
        if (out.changePct !== null && out.changePct >= 25) {
            push("RISING_SPEND", "warning", "Spending is trending up", `Outflow is ${out.changePct}% higher than the previous equal-length period (was ${inr(out.previous)}).`);
        } else if (out.changePct !== null && out.changePct <= -25) {
            push("FALLEN_SPEND", "positive", "Spending is cooling down", `Outflow is ${Math.abs(out.changePct)}% lower than the previous period (was ${inr(out.previous)}).`);
        }
        if (summary.topCategory && summary.topCategory.share >= 40 && summary.moneyOut > 0) {
            push("TOP_CATEGORY", "neutral", `${summary.topCategory.name} leads your spending`, `${inr(summary.topCategory.total)} across ${summary.topCategory.count} transaction(s) — ${summary.topCategory.share}% of outflow.`);
        }
        if (summary.topCounterparty && summary.topCounterparty.count >= 3) {
            push("FREQUENT_COUNTERPARTY", "neutral", `${summary.topCounterparty.fullName} is your most frequent payee`, `${summary.topCounterparty.count} payment(s) totalling ${inr(summary.topCounterparty.total)}.`);
        }
        if (summary.biggestDebit && summary.moneyOut > 0 && summary.biggestDebit.amount >= summary.moneyOut * 0.5) {
            push("LARGE_SINGLE_DEBIT", "warning", "One payment dominates this period", `A single ${inr(summary.biggestDebit.amount)} ${summary.biggestDebit.type === "SEND" ? `transfer to ${summary.biggestDebit.counterparty ? summary.biggestDebit.counterparty.fullName : "an external account"}` : "withdrawal"} accounts for most of your outflow.`);
        }
        if (summary.net < 0) {
            push("NET_NEGATIVE", "warning", "Spending exceeded income", `Net flow is ${inr(summary.net)} for this period.`);
        } else if (summary.net > 0) {
            push("NET_POSITIVE", "positive", "You are in the green", `Net flow is +${inr(summary.net)} for this period.`);
        }
    }
    return { period: summary.period, insights };
}

export default { resolvePeriod, getSummary, getCategoryBreakdown, getCounterparties, getTrend, getInsights };

