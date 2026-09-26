/**
 * NEXA Wallet — Extras service (Phase 11 support).
 * Notifications, beneficiaries, payment requests and recurring payments —
 * the user-side resources the frontend consumes. All ownership-gated.
 */

import prisma from "../config/prisma.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/errors.js";
import { generateRequestReference } from "../utils/ids.js";
import { resolveRecipient, sendMoney } from "./wallet.service.js";
import { notify } from "./security.service.js";
import { audit } from "./audit.service.js";

const PAGE_SIZE_MAX = 100;

function parsePage(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.pageSize ?? query.limit, 10) || 50));
    return { page, pageSize };
}

function assertAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 1) throw new BadRequestError("Amount must be at least ₹1");
    if (n > 500000) throw new BadRequestError("Amount exceeds sandbox limit of ₹5,00,000");
    return Math.round(n * 100) / 100;
}

/* ---------------- Notifications ---------------- */

export async function listNotifications(userId, query = {}) {
    const { page, pageSize } = parsePage(query);
    const where = { userId };
    if (query.unread === "true") where.isRead = false;
    const [total, unreadCount, rows] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, isRead: false } }),
        prisma.notification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);
    return { items: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), unreadCount };
}

export async function markNotificationRead(userId, id) {
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== userId) throw new NotFoundError("Notification not found");
    const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
    return { id: updated.id, isRead: updated.isRead };
}

export async function markAllNotificationsRead(userId) {
    const res = await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { updated: res.count };
}

/* ---------------- Beneficiaries ---------------- */

function shapeBeneficiary(b) {
    return {
        id: b.id,
        displayName: b.displayName,
        handle: b.handle,
        handleType: b.handleType,
        nickname: b.nickname,
        isFavorite: b.isFavorite,
        trustScore: b.trustScore,
        transactionCount: b.transactionCount,
        lastTransactionAt: b.lastTransactionAt,
        beneficiaryUserId: b.beneficiaryUserId,
        createdAt: b.createdAt,
    };
}

export async function listBeneficiaries(userId) {
    const rows = await prisma.beneficiary.findMany({
        where: { userId },
        orderBy: [{ isFavorite: "desc" }, { lastTransactionAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(shapeBeneficiary);
}

export async function createBeneficiary(userId, { identifier, nickname, isFavorite = false }) {
    const user = await resolveRecipient(identifier, userId);
    if (user.id === userId) throw new BadRequestError("You cannot add yourself");
    const b = await prisma.beneficiary.upsert({
        where: { userId_handle: { userId, handle: user.username } },
        create: {
            userId, beneficiaryUserId: user.id, displayName: user.fullName,
            handle: user.username, handleType: "USERNAME", nickname: nickname || user.fullName,
            isFavorite: Boolean(isFavorite),
        },
        update: { ...(nickname ? { nickname } : {}), isFavorite: Boolean(isFavorite) },
    });
    await audit({ userId, actorRole: "USER", action: "BENEFICIARY_ADD", entity: "Beneficiary", entityId: b.id, result: "SUCCESS" });
    return shapeBeneficiary(b);
}

export async function updateBeneficiary(userId, id, { nickname, isFavorite }) {
    const b = await prisma.beneficiary.findUnique({ where: { id } });
    if (!b || b.userId !== userId) throw new NotFoundError("Beneficiary not found");
    const updated = await prisma.beneficiary.update({
        where: { id },
        data: {
            ...(nickname !== undefined
                ? { nickname: nickname === null ? b.displayName : String(nickname).slice(0, 80) }
                : {}),
            ...(isFavorite !== undefined ? { isFavorite: Boolean(isFavorite) } : {}),
        },
    });
    return shapeBeneficiary(updated);
}

export async function deleteBeneficiary(userId, id) {
    const b = await prisma.beneficiary.findUnique({ where: { id } });
    if (!b || b.userId !== userId) throw new NotFoundError("Beneficiary not found");
    await prisma.beneficiary.delete({ where: { id } });
    return { deleted: true };
}

/* ---------------- Payment requests ---------------- */

function shapeRequest(r, viewerId) {
    const isReceiver = String(r.receiverId) === String(viewerId);
    return {
        id: r.id,
        reference: r.reference,
        amount: Number(r.amount),
        currency: r.currency,
        note: r.note,
        status: r.status,
        direction: isReceiver ? "INCOMING" : "OUTGOING",
        counterparty: isReceiver ? r.sender : r.receiver,
        expiresAt: r.expiresAt,
        respondedAt: r.respondedAt,
        createdAt: r.createdAt,
    };
}

export async function listRequests(userId, { box = "received" } = {}) {
    const where = box === "sent" ? { senderId: userId } : { receiverId: userId, status: "PENDING" };
    const rows = await prisma.paymentRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
            sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
            receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
        },
    });
    return rows.map((r) => shapeRequest(r, userId));
}

export async function createRequest(senderId, { to, amount, note = null }) {
    const value = assertAmount(amount);
    const recipient = await resolveRecipient(to, senderId);
    if (recipient.id === senderId) throw new BadRequestError("You cannot request money from yourself");
    const request = await prisma.paymentRequest.create({
        data: {
            reference: generateRequestReference(),
            senderId,
            receiverId: recipient.id,
            amount: value,
            note: note ? String(note).slice(0, 200) : null,
            status: "PENDING",
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
        include: {
            sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
            receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
        },
    });
    await notify(recipient.id, {
        type: "PAYMENT_REQUEST",
        title: "Payment request received",
        message: `${request.sender.fullName} requested ₹${value.toLocaleString("en-IN")}${note ? ` — ${String(note).slice(0, 80)}` : ""}.`,
    });
    await audit({
        userId: senderId, actorRole: "USER", action: "REQUEST_CREATE", entity: "PaymentRequest",
        entityId: request.id, result: "SUCCESS", metadata: { amount: value, to: recipient.username },
    });
    return shapeRequest(request, senderId);
}

async function loadRequest(id, viewerId) {
    const r = await prisma.paymentRequest.findUnique({
        where: { id },
        include: {
            sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
            receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
        },
    });
    if (!r) throw new NotFoundError("Payment request not found");
    if (r.senderId !== viewerId && r.receiverId !== viewerId) throw new ForbiddenError("Not your request");
    return r;
}

/** Receiver accepts → executes the P2P send through the fraud engine. */
export async function respondRequest(viewerId, id, action, client = {}) {
    const r = await loadRequest(id, viewerId);
    const want = String(action).toUpperCase();
    if (!["ACCEPT", "REJECT", "CANCEL"].includes(want)) throw new BadRequestError("action must be ACCEPT, REJECT or CANCEL");
    if (r.status !== "PENDING") throw new BadRequestError(`Request already ${r.status.toLowerCase()}`);
    if (r.expiresAt && r.expiresAt < new Date()) {
        await prisma.paymentRequest.update({ where: { id }, data: { status: "EXPIRED" } });
        throw new BadRequestError("Request has expired");
    }
    if (want === "CANCEL") {
        if (r.senderId !== viewerId) throw new ForbiddenError("Only the requester can cancel");
        const updated = await prisma.paymentRequest.update({ where: { id }, data: { status: "CANCELLED", respondedAt: new Date() } });
        await notify(r.receiverId, { type: "PAYMENT_REQUEST", title: "Request cancelled", message: `${r.sender.fullName} cancelled their payment request.` });
        return { id: updated.id, status: updated.status };
    }
    if (r.receiverId !== viewerId) throw new ForbiddenError("Only the recipient can respond");
    if (want === "REJECT") {
        const updated = await prisma.paymentRequest.update({ where: { id }, data: { status: "REJECTED", respondedAt: new Date() } });
        await notify(r.senderId, { type: "PAYMENT_REQUEST", title: "Request declined", message: `${r.receiver.fullName} declined your payment request.` });
        await audit({ userId: viewerId, actorRole: "USER", action: "REQUEST_REJECT", entity: "PaymentRequest", entityId: id, result: "SUCCESS" });
        return { id: updated.id, status: updated.status };
    }
    // ACCEPT → the receiver pays the sender through the normal P2P flow
    // (full NEXA fraud-engine scoring, escrow handling and audit trail).
    const txn = await sendMoney(viewerId, { to: r.sender.username, amount: Number(r.amount), note: `Request ${r.reference}` }, client);
    const updated = await prisma.paymentRequest.update({
        where: { id },
        data: { status: txn.status === "UNDER_REVIEW" ? "PENDING" : "ACCEPTED", respondedAt: new Date() },
    });
    await notify(r.senderId, {
        type: "PAYMENT_REQUEST",
        title: "Request paid",
        message: `${r.receiver.fullName} paid your ₹${Number(r.amount).toLocaleString("en-IN")} request (${txn.txnId}).`,
    });
    return { id: updated.id, status: updated.status, txnId: txn.txnId, risk: txn.risk, transactionStatus: txn.status };
}

/* ---------------- Recurring payments ---------------- */

const FREQUENCIES = { DAILY: 1, WEEKLY: 7, MONTHLY: 30, QUARTERLY: 91, YEARLY: 365 };
const FREQ_LABEL = { DAILY: "daily", WEEKLY: "weekly", BIWEEKLY: "bi-weekly", MONTHLY: "monthly", QUARTERLY: "quarterly", YEARLY: "yearly" };

function shapeRecurring(r, recipientUser = null) {
    return {
        id: r.id,
        recipient: recipientUser
            ? { username: recipientUser.username, fullName: recipientUser.fullName, nexaId: recipientUser.nexaId }
            : null,
        amount: Number(r.amount),
        currency: r.currency,
        frequency: r.frequency,
        frequencyLabel: FREQ_LABEL[r.frequency] || String(r.frequency).toLowerCase(),
        status: r.status,
        note: r.note,
        nextRunAt: r.nextRunAt,
        lastRunAt: r.lastRunAt,
        createdAt: r.createdAt,
    };
}

/** Recipient is a plain FK (no Prisma relation) — hydrate it manually. */
async function hydrateRecurring(rows) {
    const ids = [...new Set(rows.map((r) => r.recipientId).filter(Boolean))];
    const users = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, fullName: true, nexaId: true } })
        : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => shapeRecurring(r, byId.get(r.recipientId) || null));
}

export async function listRecurring(userId) {
    const rows = await prisma.recurringPayment.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
    return hydrateRecurring(rows);
}

export async function createRecurring(userId, { to, amount, frequency = "MONTHLY", note = null }) {
    const value = assertAmount(amount);
    const freq = String(frequency ?? "MONTHLY").toUpperCase();
    if (!FREQUENCIES[freq] && freq !== "BIWEEKLY") throw new BadRequestError("frequency must be DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY or YEARLY");
    const recipient = await resolveRecipient(to, userId);
    if (recipient.id === userId) throw new BadRequestError("You cannot set up a recurring payment to yourself");
    const stepDays = freq === "BIWEEKLY" ? 14 : FREQUENCIES[freq];
    const r = await prisma.recurringPayment.create({
        data: {
            userId,
            recipientId: recipient.id,
            amount: value,
            frequency: freq === "BIWEEKLY" ? "WEEKLY" : freq,
            note: note ? String(note).slice(0, 200) : null,
            nextRunAt: new Date(Date.now() + stepDays * 24 * 3600 * 1000),
        },
    });
    await audit({ userId, actorRole: "USER", action: "RECURRING_CREATE", entity: "RecurringPayment", entityId: r.id, result: "SUCCESS", metadata: { amount: value, to: recipient.username, frequency: freq } });
    return shapeRecurring(r, recipient);
}

async function loadRecurring(userId, id) {
    const r = await prisma.recurringPayment.findUnique({ where: { id } });
    if (!r || r.userId !== userId) throw new NotFoundError("Recurring payment not found");
    const recipientUser = r.recipientId
        ? await prisma.user.findUnique({ where: { id: r.recipientId }, select: { id: true, username: true, fullName: true, nexaId: true } })
        : null;
    return { row: r, recipientUser };
}

export async function pauseRecurring(userId, id) {
    const { row, recipientUser } = await loadRecurring(userId, id);
    if (row.status === "PAUSED") throw new BadRequestError("Already paused");
    const updated = await prisma.recurringPayment.update({ where: { id }, data: { status: "PAUSED" } });
    return shapeRecurring(updated, recipientUser);
}

export async function resumeRecurring(userId, id) {
    const { row, recipientUser } = await loadRecurring(userId, id);
    if (row.status === "ACTIVE") throw new BadRequestError("Already active");
    const updated = await prisma.recurringPayment.update({
        where: { id },
        data: { status: "ACTIVE", nextRunAt: new Date(Date.now() + 24 * 3600 * 1000) },
    });
    return shapeRecurring(updated, recipientUser);
}

export async function deleteRecurring(userId, id) {
    await loadRecurring(userId, id);
    await prisma.recurringPayment.delete({ where: { id } });
    await audit({ userId, actorRole: "USER", action: "RECURRING_DELETE", entity: "RecurringPayment", entityId: id, result: "SUCCESS" });
    return { deleted: true };
}

export default {
    listNotifications, markNotificationRead, markAllNotificationsRead,
    listBeneficiaries, createBeneficiary, updateBeneficiary, deleteBeneficiary,
    listRequests, createRequest, respondRequest,
    listRecurring, createRecurring, pauseRecurring, resumeRecurring, deleteRecurring,
};
