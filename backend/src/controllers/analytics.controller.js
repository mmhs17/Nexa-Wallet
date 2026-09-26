import * as analytics from "../services/analytics.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, serialize } from "../utils/response.js";

/** NEXA Wallet — Financial Analytics controller (Phase 8, thin HTTP layer). */

export const summary = asyncHandler(async (req, res) => {
    return ok(res, serialize(await analytics.getSummary(req.user.id, analytics.resolvePeriod(req.query))));
});

export const spending = asyncHandler(async (req, res) => {
    return ok(res, serialize(await analytics.getCategoryBreakdown(req.user.id, analytics.resolvePeriod(req.query))));
});

export const counterparties = asyncHandler(async (req, res) => {
    return ok(res, serialize(await analytics.getCounterparties(req.user.id, analytics.resolvePeriod(req.query))));
});

export const trends = asyncHandler(async (req, res) => {
    return ok(res, serialize(await analytics.getTrend(req.user.id, analytics.resolvePeriod(req.query))));
});

export const insights = asyncHandler(async (req, res) => {
    return ok(res, serialize(await analytics.getInsights(req.user.id, analytics.resolvePeriod(req.query))));
});

export default { summary, spending, counterparties, trends, insights };
