import * as twoFactorService from "../services/twoFactor.service.js";
import { cookieOptions, ACCESS_TTL_MS, REFRESH_TTL_MS, ACCESS_COOKIE, REFRESH_COOKIE } from "../services/token.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, created, serialize } from "../utils/response.js";

/**
 * NEXA Wallet — 2FA controller.
 * Setup (begin/confirm) requires auth; verify completes a pending login.
 */

export const status = asyncHandler(async (req, res) => {
    const result = await twoFactorService.getStatus(req.user.id);
    return ok(res, serialize(result));
});

export const beginSetup = asyncHandler(async (req, res) => {
    const result = await twoFactorService.beginSetup(req.user.id);
    return created(res, serialize(result));
});

export const confirmSetup = asyncHandler(async (req, res) => {
    const result = await twoFactorService.confirmSetup(req.user.id, req.body.token, req);
    return ok(res, serialize(result));
});

export const verify = asyncHandler(async (req, res) => {
    const result = await twoFactorService.verifyLogin(
        {
            pendingSessionId: req.body.pendingSessionId,
            token: req.body.token,
            recoveryCode: req.body.recoveryCode,
        },
        req
    );
    res.cookie(ACCESS_COOKIE, result.accessToken, cookieOptions(ACCESS_TTL_MS));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(REFRESH_TTL_MS));
    return ok(res, serialize({
        user: result.user,
        sessionId: result.sessionId,
        accessToken: result.accessToken,
    }));
});

export const disable = asyncHandler(async (req, res) => {
    await twoFactorService.disable(req.user.id, req.body.password, req);
    return ok(res, { disabled: true });
});

export const regenerateCodes = asyncHandler(async (req, res) => {
    const result = await twoFactorService.regenerateCodes(req.user.id, req.body.password);
    return ok(res, serialize(result));
});

export default { status, beginSetup, confirmSetup, verify, disable, regenerateCodes };
