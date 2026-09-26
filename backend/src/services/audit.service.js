import prisma from "../config/prisma.js";

/**
 * NEXA Wallet — audit log service.
 * Every authentication, security and admin action must leave a trail here.
 * Fire-and-forget safe: logs delivery problems, never throws into flows.
 */
export async function audit({ userId = null, actorRole = null, action, entity = null, entityId = null, result = "SUCCESS", metadata = null, ipAddress = null }) {
    try {
        await prisma.auditLog.create({
            data: {
                userId,
                actorRole: actorRole || undefined,
                action,
                entity: entity || undefined,
                entityId: entityId || undefined,
                result,
                metadata: metadata || undefined,
                ipAddress: ipAddress || undefined,
            },
        });
    } catch (err) {
        console.error("[NEXA] audit log failed:", err?.message);
    }
}

export default { audit };
