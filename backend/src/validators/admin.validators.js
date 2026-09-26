import { query, param, body } from "express-validator";

/** NEXA Wallet — Admin Fraud Command Center validators (Phase 10). */

export const queueListRules = [
    query("page").optional().isInt({ min: 1, max: 10000 }).withMessage("page must be 1–10000").toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1–100").toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1–100").toInt(),
];

export const flaggedListRules = [
    ...queueListRules,
    query("status").optional().isIn(["BLOCKED", "UNDER_REVIEW", "COMPLETED", "REVERSED", "FAILED", "PENDING"])
        .withMessage("status must be BLOCKED, UNDER_REVIEW, COMPLETED, REVERSED, FAILED or PENDING"),
];

export const alertListRules = [
    ...queueListRules,
    query("status").optional().isIn(["OPEN", "REVIEWING", "RESOLVED_APPROVED", "RESOLVED_REJECTED"])
        .withMessage("status must be OPEN, REVIEWING, RESOLVED_APPROVED or RESOLVED_REJECTED"),
];

export const alertIdRules = [
    param("alertId").trim().notEmpty().withMessage("alertId is required"),
];

export const resolveRules = [
    param("alertId").trim().notEmpty().withMessage("alertId is required"),
    body("decision").trim().notEmpty().withMessage("decision is required")
        .isIn(["APPROVE", "REJECT", "approve", "reject"]).withMessage("decision must be APPROVE or REJECT"),
    body("note").optional().isString().isLength({ max: 500 }).withMessage("note must be 500 characters or fewer"),
];

export const userListRules = [
    ...queueListRules,
    query("search").optional().isString().isLength({ max: 120 }).withMessage("search too long"),
    query("status").optional().isIn(["ACTIVE", "LOCKED", "SUSPENDED", "PENDING_VERIFICATION", "active", "locked", "suspended"])
        .withMessage("Unknown user status"),
    query("role").optional().isIn(["USER", "ADMIN", "user", "admin"]).withMessage("role must be USER or ADMIN"),
];

export const userIdRules = [
    param("userId").trim().notEmpty().withMessage("userId is required"),
];

export const setStatusRules = [
    param("userId").trim().notEmpty().withMessage("userId is required"),
    body("status").trim().notEmpty().withMessage("status is required")
        .isIn(["ACTIVE", "SUSPENDED", "active", "suspended"]).withMessage("status must be ACTIVE or SUSPENDED"),
];

export const auditListRules = [
    ...queueListRules,
    query("action").optional().isString().isLength({ max: 80 }).withMessage("action too long"),
    query("actorRole").optional().isIn(["USER", "ADMIN", "user", "admin"]).withMessage("actorRole must be USER or ADMIN"),
    query("result").optional().isString().isLength({ max: 40 }).withMessage("result too long"),
    query("userId").optional().isString().isLength({ max: 64 }).withMessage("userId too long"),
    query("since").optional().isISO8601().withMessage("since must be an ISO date"),
];

export default {
    queueListRules, flaggedListRules, alertListRules, alertIdRules, resolveRules,
    userListRules, userIdRules, setStatusRules, auditListRules,
};
