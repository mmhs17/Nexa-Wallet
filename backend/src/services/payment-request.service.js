import prisma from "../config/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import { audit } from "./audit.service.js";
import { notify } from "./security.service.js";
import { resolveRecipient } from "./wallet.service.js";
import { generateRequestReference, generateTransactionReference } from "../utils/ids.js";

const ALLOWED_RESPOND = ["ACCEPTED", "REJECTED", "CANCELLED"];

function shape(r) {
    return {
        id: r.id, reference: r.reference,
        amount: Number(r.amount), currency: r.currency,
        note: r.note, status: r.status, expiresAt: r.expiresAt,
        createdAt: r.createdAt, respondedAt: r.respondedAt,
        sender: r.sender ? { id: r.sender.id, username: r.sender.username,
            fullName: r.sender.fullName, nexaId: r.sender.nexaId } : null,
        receiver: r.receiver ? { id: r.receiver.id, username: r.receiver.username,
            fullName: r.receiver.fullName, nexaId: r.receiver.nexaId } : null,
    };
}

const include = {
    sender: { select: { id: true, username: true, fullName: true, nexaId: true } },
    receiver: { select: { id: true, username: true, fullName: true, nexaId: true } },
};

function assertAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 1) throw new BadRequestError("Amount must be at least 1");
    if (n > 500000) throw new BadRequestError("Amount exceeds sandbox limit of 500000");
    return Math.round(n * 100) / 100;
}

export async function createRequest(senderId, body = {}) {
    const value = assertAmount(body.amount);
    const recipient = await resolveRecipient(body.to, senderId);
    if (recipient.id === senderId) throw new BadRequestError("Cannot request from yourself");
    const hrs = Math.min(720, Math.max(1, Number(body.expiresInHours) || 72));
    const row = await prisma.paymentRequest.create({
        data: {
            reference: generateRequestReference(),
            senderId, receiverId: recipient.id,
            amount: value, currency: "INR",
            note: body.note ? String(body.note).slice(0, 200) : null,
            status: "PENDING",
            expiresAt: new Date(Date.now() + hrs * 3600 * 1000),
        },
        include,
    });
    await notify(recipient.id, {
        type: "PAYMENT_REQUEST", title: "New payment request",
        message: "Request " + row.reference + " expires in " + hrs + "h.",
    });
    await audit({
        userId: senderId, actorRole: "USER", action: "PAYMENT_REQUEST_CREATED",
        entity: "PaymentRequest", entityId: row.id, result: "SUCCESS",
        metadata: { to: recipient.username, amount: value },
    });
    return shape(row);
}

export async function listRequests(userId, query = {}) {
    const box = String(query.box || "all").toLowerCase();
    const where = box === "sent" ? { senderId: userId }
        : box === "received" ? { receiverId: userId }
        : { OR: [{ senderId: userId }, { receiverId: userId }] };
    const status = String(query.status || "").toUpperCase();
    if (["PENDING", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(status)) {
        where.status = status;
    }
    const rows = await prisma.paymentRequest.findMany({
        where, include, orderBy: { createdAt: "desc" }, take: 100,
    });
    const now = new Date();
    return {
        items: rows.map((r) => {
            const expired = r.status === "PENDING" && r.expiresAt && r.expiresAt < now;
            return shape({ ...r, status: expired ? "EXPIRED" : r.status });
        }),
        total: rows.length,
    };
}

export async function respondToRequest(userId, id, body = {}) {
    const want = String(body.decision || "").toUpperCase();
    if (!ALLOWED_RESPOND.includes(want)) {
        throw new BadRequestError("decision must be ACCEPTED, REJECTED or CANCELLED");
    }
    const row = await prisma.paymentRequest.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundError("Payment request not found");
    const isReceiver = String(row.receiverId) === String(userId);
    const isSender = String(row.senderId) === String(userId);
    if (!isReceiver && !isSender) throw new ForbiddenError("No access to this request");
    if (row.status !== "PENDING") throw new BadRequestError("Request is " + row.status);
    if (row.expiresAt && row.expiresAt < new Date()) {
        await prisma.paymentRequest.update({ where: { id }, data: { status: "EXPIRED" } });
        throw new BadRequestError("Request has expired");
    }
    if (want === "CANCELLED" && !isSender) throw new ForbiddenError("Only requester cancels");
    if ((want === "ACCEPTED" || want === "REJECTED") && !isReceiver) {
        throw new ForbiddenError("Only recipient responds");
    }
    if (want !== "ACCEPTED") {
        const updated = await prisma.paymentRequest.update({
            where: { id }, data: { status: want, respondedAt: new Date() }, include,
        });
        await notify(want === "CANCELLED" ? row.receiverId : row.senderId, {
            type: "PAYMENT_REQUEST", title: "Request " + want.toLowerCase(),
            message: "Request " + row.reference + " was " + want.toLowerCase() + ".",
        });
        return shape(updated);
    }
    const payerId = row.receiverId;
    const payeeId = row.senderId;
    const value = Number(row.amount);
    const payerWallet = await prisma.wallet.findUnique({ where: { userId: payerId } });
    const payeeWallet = await prisma.wallet.findUnique({ where: { userId: payeeId } });
    if (!payerWallet || !payeeWallet) throw new NotFoundError("Wallet not found");
    if (payerWallet.status === "FROZEN") throw new ForbiddenError("Payer wallet frozen");
    if (Number(payerWallet.balance) < value) throw new BadRequestError("Insufficient balance");
    const txnRef = generateTransactionReference();
    await prisma.$transaction(async (tx) => {
        const fresh = await tx.wallet.findUnique({ where: { id: payerWallet.id } });
        if (Number(fresh.balance) < value) throw new BadRequestError("Insufficient balance");
        await tx.wallet.update({ where: { id: payerWallet.id }, data: { balance: { decrement: value } } });
        await tx.wallet.update({ where: { id: payeeWallet.id }, data: { balance: { increment: value } } });
        await tx.transaction.create({
            data: {
                reference: txnRef, type: "REQUEST", status: "COMPLETED",
                amount: value, currency: "INR",
                senderId: payerId, receiverId: payeeId,
                senderWalletId: payerWallet.id, receiverWalletId: payeeWallet.id,
                note: row.note || ("Request " + row.reference + " settled"),
                metadata: { sandbox: true, requestId: row.id },
                completedAt: new Date(),
            },
        });
        await tx.paymentRequest.update({ where: { id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    });
    const updated = await prisma.paymentRequest.findUnique({ where: { id }, include });
    await notify(payeeId, {
        type: "PAYMENT_RECEIVED", title: "Request accepted",
        message: "Request " + row.reference + " accepted. Ref " + txnRef + ".",
    });
    await audit({
        userId, actorRole: "USER", action: "PAYMENT_REQUEST_ACCEPTED",
        entity: "PaymentRequest", entityId: id, result: "SUCCESS",
        metadata: { txnRef, amount: value },
    });
    return { ...shape(updated), txnRef };
}

export default { createRequest, listRequests, respondToRequest };

