import * as authService from "../services/auth.service.js";
import { getClientInfo } from "../services/session.service.js";
import {
    signAccessToken,
    signRefreshToken,
    cookieOptions,
    ACCESS_TTL_MS,
    REFRESH_TTL_MS,
    ACCESS_COOKIE,
    REFRESH_COOKIE,
} from "../services/token.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, created, serialize } from "../utils/response.js";
import { env } from "../config/env.js";

/**
 * NEXA Wallet — authentication controller.
 * Thin HTTP layer: cookies + status codes here, business logic in services.
 */

function setAuthCookies(res, { accessToken, refreshToken }) {
    res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TTL_MS));
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_MS));
}

function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

function sessionPayload(result) {
    return serialize({
        user: result.user,
        sessionId: result.sessionId,
        accessToken: result.accessToken,
    });
}

export const register = asyncHandler(async (req, res) => {
    const result = await authService.register(req.body, getClientInfo(req));
    return created(res, serialize({
        user: result.user,
        // Sandbox convenience: mailed AND returned so demos verify instantly.
        ...(env.isProd ? {} : { emailVerifyToken: result.emailVerifyToken }),
    }));
});

export const verifyEmail = asyncHandler(async (req, res) => {
    const user = await authService.verifyEmail(req.body.token);
    return ok(res, serialize({ user }));
});

export const resendVerification = asyncHandler(async (req, res) => {
    await authService.resendVerification(req.body.email);
    return ok(res, { sent: true });
});

export const login = asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, getClientInfo(req));
    if (result.twoFactorRequired) {
        // 202: credentials accepted, TOTP step still pending.
        return res.status(202).json({
            success: true,
            data: serialize({
                twoFactorRequired: true,
                pendingSessionId: result.pendingSessionId,
                user: result.user,
            }),
        });
    }
    setAuthCookies(res, result);
    return ok(res, sessionPayload(result));
});

export const refresh = asyncHandler(async (req, res) => {
    const presented = req.body.refreshToken || req.cookies?.[REFRESH_COOKIE];
    const result = await authService.refresh(presented);
    setAuthCookies(res, result);
    return ok(res, sessionPayload(result));
});

// Re-mint cookies from a valid access token's session (silent re-auth helper).
export const reissue = asyncHandler(async (req, res) => {
    const { default: prisma } = await import("../config/prisma.js");
    const session = await prisma.userSession.findUnique({ where: { id: req.user.sessionId } });
    if (!session || session.revoked) {
        clearAuthCookies(res);
        return res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Session expired. Please log in again." },
        });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const accessToken = signAccessToken({ userId: user.id, role: user.role, sessionId: session.id });
    const refreshToken = signRefreshToken({ userId: user.id, sessionId: session.id });
    const { rotateSession } = await import("../services/session.service.js");
    await rotateSession(session.id, refreshToken);
    setAuthCookies(res, { accessToken, refreshToken });
    return ok(res, serialize({ sessionId: session.id }));
});

export const logout = asyncHandler(async (req, res) => {
    await authService.logout(
        {
            sessionId: req.user?.sessionId || null,
            userId: req.user?.id || null,
            revokeAll: req.body?.all === true,
        },
        getClientInfo(req)
    );
    clearAuthCookies(res);
    return ok(res, { loggedOut: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
    const result = await authService.requestPasswordReset(req.body.email, getClientInfo(req));
    return ok(res, serialize({ sent: true, ...(result.resetToken ? { resetToken: result.resetToken } : {}) }));
});

export const resetPassword = asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body, getClientInfo(req));
    return ok(res, { reset: true });
});

export const changePassword = asyncHandler(async (req, res) => {
    await authService.changePassword(req.user.id, req.body, getClientInfo(req));
    return ok(res, { changed: true });
});

export const me = asyncHandler(async (req, res) => {
    const profile = await authService.getMe(req.user.id);
    return ok(res, serialize(profile));
});

export default {
    register,
    verifyEmail,
    resendVerification,
    login,
    refresh,
    reissue,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
    me,
};
