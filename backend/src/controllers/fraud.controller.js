import * as fraudService from "../services/fraud.service.js";
import { getClientInfo } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, paginated, serialize } from "../utils/response.js";

/** NEXA Wallet — Explainable Fraud Intelligence controller (Phase 5). */

export const preflight = asyncHandler(async (req, res) => {
    const result = await fraudService.preflight(req.user.id, req.body, getClientInfo(req));
    return ok(res, serialize(result));
});

export const assessments = asyncHandler(async (req, res) => {
    const result = await fraudService.listAssessments(req.user.id, req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export const transactionAssessment = asyncHandler(async (req, res) => {
    const result = await fraudService.getAssessmentForTransaction(req.user.id, req.params.transactionId);
    return ok(res, serialize(result));
});

export const alerts = asyncHandler(async (req, res) => {
    const result = await fraudService.listAlerts(req.user.id, req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export default { preflight, assessments, transactionAssessment, alerts };
