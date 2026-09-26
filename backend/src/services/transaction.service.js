import prisma from "../config/prisma.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";

/**
 * NEXA Wallet — Phase 4: transaction ledger (history, filters, CSV, receipts).
 * Every row is read through an ownership gate: the viewer must be the
 * sender or the receiver. List output stamps each row with a viewer-relative
 * `direction` (CREDIT / DEBIT) plus counterparty identity + category.
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const EXPORT_LIMIT_MAX = 5000;

const ALLOWED_TYPES = ["SEND", "RECEIVE", "ADD_MONEY", "WITHDRAW", "REQUEST", "REFUND"];
const ALLOWED_STATUS = ["COMPLETED", "PENDING", "FAILED", "REVERSED", "BLOCKED", "UNDER_REVIEW"];
const ALLOWED_DIRECTIONS = ["CREDIT", "DEBIT"];
const ALLOWED_SORT = ["createdAt", "amount"];

function toNumber(d) {
    return d === null || d === undefined ? null : Number(d);
}

/** Viewer-relative money direction. */
function directionOf(txn, viewerId) {
    if (txn.receiverId && String(txn.receiverId) === String(viewerId)) return "CREDIT";
    if (txn.senderId && String(txn.senderId) === String(viewerId)) return "DEBIT";
    return "DEBIT";
}

/** Build the Prisma `where` clause shared by list + count + export. */
function buildWhere(viewerId, filters = {}) {
    const and = [{ OR: [{ senderId: viewerId }, { receiverId: viewerId }] }];

    if (filters.type) and.push({ type: filters.type });
    if (filters.status) and.push({ status: filters.status });
    if (filters.categoryId) and.push({ categoryId: filters.categoryId });
    if (filters.reference) and.push({ reference: { contains: String(filters.reference).trim(), mode: "insensitive" } });
    if (filters.search) {
        const q = String(filters.search).trim();
        if (q) {
            and.push({
                OR: [
                    { reference: { contains: q, mode: "insensitive" } },
                    { note: { contains: q, mode: "insensitive" } },
                ],
            });
        }
    }
    if (filters.from || filters.to) {
        const createdAt = {};
        if (filters.from) {
            const d = new Date(filters.from);
            if (!Number.isNaN(d.getTime())) createdAt.gte = d;
        }
        if (filters.to) {
            const d = new Date(filters.to);
            if (!Number.isNaN(d.getTime())) createdAt.lte = d;
        }
        if (Object.keys(createdAt).length > 0) and.push({ createdAt });
    }
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        const amount = {};
        const lo = Number(filters.minAmount);
        const hi = Number(filters.maxAmount);
        if (filters.minAmount !== undefined && filters.minAmount !== "" && Number.isFinite(lo)) amount.gte = lo;
        if (filters.maxAmount !== undefined && filters.maxAmount !== "" && Number.isFinite(hi)) amount.lte = hi;
        if (Object.keys(amount).length > 0) and.push({ amount });
    }
    if (filters.direction === "CREDIT") and.push({ receiverId: viewerId });
    else if (filters.direction === "DEBIT") and.push({ senderId: viewerId });

    return { AND: and };
}


function shapeRow(txn, viewerId) {
    const direction = directionOf(txn, viewerId);
    const counterparty = direction === "CREDIT" ? txn.sender : txn.receiver;
    return {
        id: txn.id,
        reference: txn.reference,
        type: txn.type,
        status: txn.status,
        direction,
        amount: toNumber(txn.amount),
        fee: toNumber(txn.fee),
        currency: txn.currency,
        note: txn.note,
        category: txn.category
            ? { id: txn.category.id, name: txn.category.name, slug: txn.category.slug, icon: txn.category.icon, color: txn.category.color }
            : null,
        counterparty: counterparty
            ? { id: counterparty.id, nexaId: counterparty.nexaId, username: counterparty.username, fullName: counterparty.fullName }
            : null,
        paymentMethod: txn.paymentMethod,
        requiresReview: txn.requiresReview,
        riskScore: txn.risk ? Number(txn.risk.riskScore) : null,
        risk: explainRisk(txn.risk),
        createdAt: txn.createdAt,
        completedAt: txn.completedAt,
    };
}

const rowInclude = {
    sender: { select: { id: true, nexaId: true, username: true, fullName: true } },
    receiver: { select: { id: true, nexaId: true, username: true, fullName: true } },
    category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
    risk: { select: { id: true, riskScore: true, riskLevel: true, factors: true, recommendation: true, engineVersion: true, createdAt: true } },
};

function explainRisk(risk) {
    if (!risk) return null;
    const factors = Array.isArray(risk.factors) ? risk.factors : [];
    const reasons = factors.map((f) => f.detail || f.code).filter(Boolean);
    return {
        score: risk.riskScore,
        level: risk.riskLevel,
        decision: risk.riskScore >= 85 ? "BLOCK" : risk.riskScore >= 60 ? "REVIEW" : "ALLOW",
        factors,
        reasons,
        recommendation: risk.recommendation,
        engineVersion: risk.engineVersion,
        assessedAt: risk.createdAt,
    };
}

function parseListQuery(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const rawSize = Number.parseInt(query.pageSize ?? query.limit, 10) || PAGE_SIZE_DEFAULT;
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, rawSize));
    const sortBy = ALLOWED_SORT.includes(query.sortBy) ? query.sortBy : "createdAt";
    const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const filters = {};
    if (query.type && ALLOWED_TYPES.includes(String(query.type).toUpperCase())) filters.type = String(query.type).toUpperCase();
    if (query.status && ALLOWED_STATUS.includes(String(query.status).toUpperCase())) filters.status = String(query.status).toUpperCase();
    if (query.direction && ALLOWED_DIRECTIONS.includes(String(query.direction).toUpperCase())) {
        filters.direction = String(query.direction).toUpperCase();
    }
    if (query.categoryId) filters.categoryId = String(query.categoryId);
    if (query.reference) filters.reference = String(query.reference);
    if (query.search) filters.search = String(query.search);
    if (query.from) filters.from = String(query.from);
    if (query.to) filters.to = String(query.to);
    if (query.minAmount !== undefined) filters.minAmount = query.minAmount;
    if (query.maxAmount !== undefined) filters.maxAmount = query.maxAmount;
    return { page, pageSize, sortBy, sortOrder, filters };
}

/** Paginated ledger for the signed-in user. */
export async function listTransactions(viewerId, query = {}) {
    const { page, pageSize, sortBy, sortOrder, filters } = parseListQuery(query);
    const where = buildWhere(viewerId, filters);
    const orderBy = sortBy === "amount" ? [{ amount: sortOrder }, { createdAt: "desc" }] : [{ createdAt: sortOrder }];
    const [total, rows] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
            where,
            include: rowInclude,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);
    return {
        items: rows.map((t) => shapeRow(t, viewerId)),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        filters,
        sortBy,
        sortOrder,
    };
}

/** Single transaction detail behind the ownership gate. */
export async function getTransaction(viewerId, idOrReference) {
    const q = String(idOrReference || "").trim();
    if (!q) throw new NotFoundError("Transaction not found");
    const txn = await prisma.transaction.findFirst({
        where: {
            AND: [
                { OR: [{ id: q }, { reference: q }] },
                { OR: [{ senderId: viewerId }, { receiverId: viewerId }] },
            ],
        },
        include: {
            ...rowInclude,
            risk: { select: { riskScore: true, riskLevel: true, factors: true, recommendation: true, engineVersion: true, createdAt: true } },
        },
    });
    if (!txn) throw new NotFoundError("Transaction not found");
    const base = shapeRow(txn, viewerId);
    return {
        ...base,
        risk: txn.risk
            ? {
                  score: txn.risk.riskScore,
                  level: txn.risk.riskLevel,
                  decision:
                      txn.risk.riskScore >= 85 ? "BLOCK" : txn.risk.riskScore >= 60 ? "REVIEW" : "ALLOW",
                  factors: txn.risk.factors,
                  recommendation: txn.risk.recommendation,
                  engineVersion: txn.risk.engineVersion,
                  evaluatedAt: txn.risk.createdAt,
              }
            : null,
    };
}

/** Shareable receipt payload for one owned transaction. */
export async function getReceipt(viewerId, idOrReference) {
    const detail = await getTransaction(viewerId, idOrReference);
    return {
        ...detail,
        receipt: {
            title: "NEXA Wallet — Payment Receipt",
            sandboxNotice: "DEMO ENVIRONMENT — NO REAL MONEY",
            generatedAt: new Date().toISOString(),
        },
    };
}

/** CSV export of the filtered ledger (bounded, same ownership scope). */
export async function exportTransactionsCsv(viewerId, query = {}) {
    const { filters } = parseListQuery(query);
    const limit = Math.min(EXPORT_LIMIT_MAX, Math.max(1, Number.parseInt(query.limit, 10) || EXPORT_LIMIT_MAX));
    const rows = await prisma.transaction.findMany({
        where: buildWhere(viewerId, filters),
        include: rowInclude,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
    });
    const header = ["reference", "type", "status", "direction", "amount", "fee", "currency", "counterparty", "category", "note", "createdAt", "completedAt"];
    const escape = (v) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const t of rows) {
        const r = shapeRow(t, viewerId);
        lines.push(
            [
                r.reference, r.type, r.status, r.direction, r.amount, r.fee ?? 0, r.currency,
                r.counterparty ? `${r.counterparty.fullName} (${r.counterparty.username})` : "",
                r.category ? r.category.name : "", r.note ?? "",
                r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
                r.completedAt instanceof Date ? r.completedAt.toISOString() : (r.completedAt ?? ""),
            ].map(escape).join(",")
        );
    }
    return { csv: lines.join("\n") + "\n", count: rows.length, truncated: rows.length >= limit };
}

/** Guard helper for fraud/admin surfaces reusing ledger ownership. */
export async function assertTransactionVisible(viewerId, transactionId, opts = {}) {
    if (opts.adminBypass) return true;
    const txn = await prisma.transaction.findFirst({
        where: { id: transactionId, OR: [{ senderId: viewerId }, { receiverId: viewerId }] },
        select: { id: true },
    });
    if (!txn) throw new ForbiddenError("You do not have access to this transaction");
    return true;
}

export default { listTransactions, getTransaction, getReceipt, exportTransactionsCsv, assertTransactionVisible };

