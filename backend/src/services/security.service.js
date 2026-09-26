import prisma from "../config/prisma.js";

/**
 * NEXA Wallet — security events + notifications helper.
 * Keeps the Security Center timeline and notification bell fed
 * from one place so no flow forgets them.
 */

export async function recordSecurityEvent(userId, { type, severity = "INFO", message, deviceId = null, ipAddress = null, metadata = null }) {
    try {
        await prisma.securityEvent.create({
            data: {
                userId,
                type,
                severity,
                message,
                deviceId: deviceId || undefined,
                ipAddress: ipAddress || undefined,
                metadata: metadata || undefined,
            },
        });
    } catch (err) {
        console.error("[NEXA] security event failed:", err?.message);
    }
}

export async function notify(userId, { type, title, message, data = null }) {
    try {
        await prisma.notification.create({
            data: { userId, type, title, message, data: data || undefined },
        });
    } catch (err) {
        console.error("[NEXA] notification failed:", err?.message);
    }
}

export default { recordSecurityEvent, notify };
