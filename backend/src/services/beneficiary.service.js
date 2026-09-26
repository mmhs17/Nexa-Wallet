import prisma from "../config/prisma.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";
import { audit } from "./audit.service.js";
import { resolveRecipient } from "./wallet.service.js";

/**
 * NEXA Wallet — beneficiaries service.
 * Trusted-recipient address book. Every mutation is ownership-gated:
 * users can only read/write rows where beneficiary.userId = self.
 */

export async function listBeneficiaries(userId, query = {}) {
    const search = String(query.search || "").trim();
    const where = { userId };
    if (search) {
        where.OR = [
            { displayName: { contains: search, mode: "insensitive" } },
            { handle: { contains: search, mode: "insensitive" } },
            { nickname: { contains: search, mode: "insensitive" } },
        ];
    }
    const rows = await prisma.beneficiary.findMany({
        where,
        orderBy: [{ isFavorite: "desc" }, { lastTransactionAt: "desc" }, { createdAt: "desc" }],
        take: 200,
    });
    return {
        items: rows.map((b) => ({
            id: b.id, displayName: b.displayName, handle: b.handle,
            handleType: b.handleType, nickname: b.nickname,
            beneficiaryUserId: b.beneficiaryUserId, isFavorite: b.isFavorite,
            trustScore: b.trustScore, transactionCount: b.transactionCount,
            lastTransactionAt: b.lastTransactionAt, createdAt: b.createdAt,
        })),
        total: rows.length,
    };
}

function handleTypeOf(identifier) {
    const q = String(identifier || "").trim();
    if (q.includes("@")) return "EMAIL";
    if (/^[+]?[0-9]{7,15}$/.test(q.replace(/[\s-]/g, ""))) return "PHONE";
    if (/^NEXA-/i.test(q)) return "NEXA_ID";
    return "USERNAME";
}

export async function addBeneficiary(userId, { identifier, nickname = null, favorite = false }) {
    const q = String(identifier || "").trim();
    if (!q) throw new BadRequestError("Recipient identifier is required");
    const recipient = await resolveRecipient(q, userId);
    if (recipient.id === userId) throw new BadRequestError("You cannot add yourself as a beneficiary");
    const existing = await prisma.beneficiary.findUnique({
        where: { userId_handle: { userId, handle: recipient.username } },
    });
    if (existing) {
        const updated = await prisma.beneficiary.update({
            where: { id: existing.id },
            data: {
                displayName: recipient.fullName,
                beneficiaryUserId: recipient.id,
                ...(nickname !== undefined ? { nickname: nickname ? String(nickname).slice(0, 80) : null } : {}),
                ...(favorite !== undefined ? { isFavorite: Boolean(favorite) } : {}),
            },
        });
        return { id: updated.id, updated: true };
    }
    const created = await prisma.beneficiary.create({
        data: {
            userId, beneficiaryUserId: recipient.id,
            displayName: recipient.fullName, handle: recipient.username,
            handleType: handleTypeOf(q),
            nickname: nickname ? String(nickname).slice(0, 80) : recipient.fullName,
            isFavorite: Boolean(favorite),
        },
    });
    await audit({
        userId, actorRole: "USER", action: "BENEFICIARY_ADDED",
        entity: "Beneficiary", entityId: created.id, result: "SUCCESS",
        metadata: { handle: recipient.username },
    });
    return { id: created.id, created: true };
}

export async function updateBeneficiary(userId, id, patch = {}) {
    const row = await prisma.beneficiary.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError("Beneficiary not found");
    const data = {};
    if (patch.nickname !== undefined) data.nickname = patch.nickname ? String(patch.nickname).slice(0, 80) : null;
    if (patch.favorite !== undefined) data.isFavorite = Boolean(patch.favorite);
    if (patch.trustScore !== undefined) {
        const n = Number(patch.trustScore);
        if (!Number.isInteger(n) || n < 0 || n > 100) throw new BadRequestError("trustScore must be 0–100");
        data.trustScore = n;
    }
    if (Object.keys(data).length === 0) throw new BadRequestError("No valid beneficiary fields provided");
    const updated = await prisma.beneficiary.update({ where: { id }, data });
    return { id: updated.id, nickname: updated.nickname, isFavorite: updated.isFavorite, trustScore: updated.trustScore };
}

export async function removeBeneficiary(userId, id) {
    const row = await prisma.beneficiary.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError("Beneficiary not found");
    await prisma.beneficiary.delete({ where: { id } });
    await audit({
        userId, actorRole: "USER", action: "BENEFICIARY_REMOVED",
        entity: "Beneficiary", entityId: id, result: "SUCCESS",
    });
    return { removed: true, id };
}

export default { listBeneficiaries, addBeneficiary, updateBeneficiary, removeBeneficiary };
