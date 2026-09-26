import prisma from "../config/prisma.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";
import { audit } from "./audit.service.js";
import { resolveRecipient } from "./wallet.service.js";

const FREQS = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];
const STATES = ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

function shape(r) {
    return {
        id: r.id, amount: Number(r.amount), currency: r.currency,
        frequency: r.frequency, status: r.status,
        category: r.category, note: r.note,
        nextRunAt: r.nextRunAt, lastRunAt: r.lastRunAt,
        reminderHours: r.reminderHours,
        recipientUserId: r.recipientId, createdAt: r.createdAt,
    };
}

function nextRun(freq, from = new Date()) {
    const d = new Date(from);
    if (freq === "DAILY") d.setDate(d.getDate() + 1);
    else if (freq === "WEEKLY") d.setDate(d.getDate() + 7);
    else if (freq === "QUARTERLY") d.setMonth(d.getMonth() + 3);
    else if (freq === "YEARLY") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
}

export async function listRecurring(userId) {
    const rows = await prisma.recurringPayment.findMany({
        where: { userId }, orderBy: { nextRunAt: "asc" }, take: 100,
    });
    return { items: rows.map(shape), total: rows.length };
}

export async function createRecurring(userId, body = {}) {
    const freq = String(body.frequency || "MONTHLY").toUpperCase();
    if (!FREQS.includes(freq)) throw new BadRequestError("Bad frequency");
    const value = Number(body.amount);
    if (!Number.isFinite(value) || value < 1 || value > 500000) {
        throw new BadRequestError("Amount must be 1-500000");
    }
    const recipient = await resolveRecipient(body.to, userId);
    const start = body.nextRunAt ? new Date(body.nextRunAt) : nextRun(freq);
    if (Number.isNaN(start.getTime())) throw new BadRequestError("Bad nextRunAt");
    const row = await prisma.recurringPayment.create({
        data: {
            userId, recipientId: recipient.id,
            amount: Math.round(value * 100) / 100, currency: "INR",
            frequency: freq, status: "ACTIVE",
            category: body.category ? String(body.category).slice(0, 60) : null,
            note: body.note ? String(body.note).slice(0, 200) : null,
            nextRunAt: start,
            reminderHours: Math.min(168, Math.max(1, Number(body.reminderHours) || 24)),
        },
    });
    await audit({
        userId, actorRole: "USER", action: "RECURRING_CREATED",
        entity: "RecurringPayment", entityId: row.id, result: "SUCCESS",
        metadata: { to: recipient.username, amount: value, frequency: freq },
    });
    return shape(row);
}

export async function setRecurringStatus(userId, id, status) {
    const want = String(status || "").toUpperCase();
    if (!STATES.includes(want)) throw new BadRequestError("Bad status");
    const row = await prisma.recurringPayment.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError("Recurring payment not found");
    const updated = await prisma.recurringPayment.update({ where: { id }, data: { status: want } });
    return shape(updated);
}

export async function removeRecurring(userId, id) {
    const row = await prisma.recurringPayment.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError("Recurring payment not found");
    await prisma.recurringPayment.delete({ where: { id } });
    return { removed: true, id };
}

export default { listRecurring, createRecurring, setRecurringStatus, removeRecurring };
