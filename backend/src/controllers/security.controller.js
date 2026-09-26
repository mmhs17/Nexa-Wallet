import * as securityCenter from "../services/security-center.service.js";
import * as txPinService from "../services/txpin.service.js";
import { getClientInfo } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, created, paginated, serialize } from "../utils/response.js";

/** NEXA Wallet — Security Center controller (Phase 7, thin HTTP layer). */

export const overview = asyncHandler(async (req, res) => {
    const result = await securityCenter.getOverview(req.user.id, req.user.sessionId);
    return ok(res, serialize(result));
});

export const events = asyncHandler(async (req, res) => {
    const result = await securityCenter.listEvents(req.user.id, req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export const sessions = asyncHandler(async (req, res) => {
    const result = await securityCenter.listSessions(req.user.id, req.user.sessionId);
    return ok(res, serialize(result));
});

export const revokeSession = asyncHandler(async (req, res) => {
    const client = { ...getClientInfo(req), currentSessionId: req.user.sessionId };
    const result = await securityCenter.revokeOneSession(req.user.id, req.params.sessionId, client);
    return ok(res, serialize(result));
});

export const revokeAllOthers = asyncHandler(async (req, res) => {
    const client = { ...getClientInfo(req), currentSessionId: req.user.sessionId };
    const result = await securityCenter.revokeOtherSessions(req.user.id, req.user.sessionId, client);
    return created(res, serialize(result));
});

/* --- Transaction security key (4-digit TX PIN) --- */

export const txPinStatus = asyncHandler(async (req, res) => {
    return ok(res, serialize(await txPinService.getTxPinStatus(req.user.id)));
});

export const setTxPin = asyncHandler(async (req, res) => {
    const client = getClientInfo(req);
    const result = await txPinService.setTxPin(req.user.id, req.body.pin, req.body.password, client);
    return ok(res, serialize(result));
});

export const clearTxPin = asyncHandler(async (req, res) => {
    const client = getClientInfo(req);
    const result = await txPinService.clearTxPin(req.user.id, req.body.password, client);
    return ok(res, serialize(result));
});

export default { overview, events, sessions, revokeSession, revokeAllOthers, txPinStatus, setTxPin, clearTxPin };
