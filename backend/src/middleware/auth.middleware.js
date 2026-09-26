import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

/**
 * NEXA Wallet — authentication & authorization middleware.
 * Access tokens are accepted via `Authorization: Bearer <token>`
 * or the httpOnly `nexa_access` cookie. Payload shape (set at login):
 *   { sub: userId, role, sid: sessionId, type: "access" }
 */

function extractToken(req) {
    if (req.cookies?.nexa_access) return req.cookies.nexa_access;
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) return header.slice(7).trim();
    return null;
}

/** Require a valid access token. Attaches `req.user = { id, role, sessionId }`. */
export function authenticate(req, _res, next) {
    const token = extractToken(req);
    if (!token) return next(new UnauthorizedError("Authentication required"));

    let payload;
    try {
        payload = jwt.verify(token, env.jwt.accessSecret);
    } catch {
        return next(new UnauthorizedError("Invalid or expired token"));
    }
    if (payload.type && payload.type !== "access") {
        return next(new UnauthorizedError("Invalid token type"));
    }

    // Session binding: a revoked/killed device session invalidates its
    // access tokens immediately (Security Center revoke, emergency lock, …).
    if (payload.sid) {
        prisma.userSession
            .findUnique({ where: { id: payload.sid }, select: { revoked: true, expiresAt: true } })
            .then((session) => {
                if (!session || session.revoked || session.expiresAt < new Date()) {
                    return next(new UnauthorizedError("Session is no longer active"));
                }
                req.user = { id: payload.sub, role: payload.role, sessionId: payload.sid ?? null };
                return next();
            })
            .catch(() => next(new UnauthorizedError("Invalid or expired token")));
        return;
    }

    req.user = { id: payload.sub, role: payload.role, sessionId: null };
    return next();
}

/** Attach user when a token is present, otherwise continue anonymously. */
export function optionalAuth(req, _res, next) {
    const token = extractToken(req);
    if (!token) return next();
    try {
        const payload = jwt.verify(token, env.jwt.accessSecret);
        req.user = { id: payload.sub, role: payload.role, sessionId: payload.sid ?? null };
    } catch {
        // Silently ignore — request proceeds as unauthenticated.
    }
    return next();
}

/** Require one of the given roles (use after `authenticate`). */
export function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) throw new UnauthorizedError("Authentication required");
        if (!roles.includes(req.user.role)) {
            throw new ForbiddenError("Access denied: insufficient privileges");
        }
        return next();
    };
}

/** Shorthand for admin-only routes (Fraud Command Center, audit logs, …). */
export const requireAdmin = requireRole("ADMIN");

export default { authenticate, optionalAuth, requireRole, requireAdmin };
