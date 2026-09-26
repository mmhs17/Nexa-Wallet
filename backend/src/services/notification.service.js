import prisma from "../config/prisma.js";

/**
 * NEXA Wallet — notifications service.
 * Ownership-gated inbox fed by wallet, fraud, security and admin flows.
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

function parsePage(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.pageSize ?? query.limit, 10) || PAGE_SIZE_DEFAULT));
    return { page, pageSize };
}

export async function listNotifications(userId, query = {}) {
    const { page, pageSize } = parsePage(query);
    const where = { userId };
    if (query.unreadOnly === true || query.unreadOnly === "true") where.isRead = false;
    if (query.type) where.type = String(query.type).toUpperCase();
    const [total, unread, rows] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, isRead: false } }),
        prisma.notification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);
    return {
        items: rows.map((n) => ({
            id: n.id, type: n.type, title: n.title, message: n.message,
            data: n.data, isRead: n.isRead, createdAt: n.createdAt,
        })),
        page, pageSize, total, unread,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}

export async function markRead(userId, { ids = null, all = false } = {}) {
    if (all) {
        const r = await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return { marked: r.count };
    }
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (list.length === 0) return { marked: 0 };
    const r = await prisma.notification.updateMany({
        where: { userId, id: { in: list } },
        data: { isRead: true },
    });
    return { marked: r.count };
}

export default { listNotifications, markRead };
