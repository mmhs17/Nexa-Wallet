import * as intelligence from "../services/intelligence.service.js";
import { getClientInfo } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, serialize } from "../utils/response.js";

/** NEXA Wallet — NEXA Intelligence Assistant controller (Phase 9). */

export const chat = asyncHandler(async (req, res) => {
    const result = await intelligence.chat(req.user.id, req.body.message, getClientInfo(req));
    return ok(res, serialize(result));
});

export const context = asyncHandler(async (req, res) => {
    const result = await intelligence.getContext(req.user.id);
    return ok(res, serialize(result));
});

export default { chat, context };