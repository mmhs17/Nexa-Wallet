import * as admin from "../services/admin.service.js";
import { getClientInfo } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, paginated, serialize } from "../utils/response.js";

/** NEXA Wallet — Admin Fraud Command Center controller (Phase 10, thin HTTP layer). */

export const stats = asyncHandler(async (req, res) => {
    return ok(res, serialize(await admin.getQueueStats()));
});

export const flaggedTransactions = asyncHandler(async (req, res) => {
    const result = await admin.listFlaggedTransactions(req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export const alerts = asyncHandler(async (req, res) => {
    const result = await admin.listAllAlerts(req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export const alertDetail = asyncHandler(async (req, res) => {
    return ok(res, serialize(await admin.getAlertDetail(req.params.alertId)));
});

export const claim = asyncHandler(async (req, res) => {
    const result = await admin.claimAlert(req.user.id, req.params.alertId, getClientInfo(req));
    return ok(res, serialize(result));
});

export const resolve = asyncHandler(async (req, res) => {
    const result = await admin.resolveAlert(req.user.id, req.params.alertId, req.body, getClientInfo(req));
    return ok(res, serialize(result));
});

export const users = asyncHandler(async (req, res) => {
    const result = await admin.listUsers(req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export const userDetail = asyncHandler(async (req, res) => {
    return ok(res, serialize(await admin.getUserDetail(req.params.userId)));
});

export const setStatus = asyncHandler(async (req, res) => {
    const result = await admin.setUserStatus(req.user.id, req.params.userId, req.body, getClientInfo(req));
    return ok(res, serialize(result));
});

export const auditLogs = asyncHandler(async (req, res) => {
    const result = await admin.listAuditLogs(req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export default {
    stats, flaggedTransactions, alerts, alertDetail, claim,
    resolve, users, userDetail, setStatus, auditLogs,
};
