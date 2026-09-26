import { query, param } from "express-validator";

/** NEXA Wallet — transaction ledger validators (Phase 4). */

const typeValues = ["SEND", "RECEIVE", "ADD_MONEY", "WITHDRAW", "REQUEST", "REFUND"];
const statusValues = ["COMPLETED", "PENDING", "FAILED", "REVERSED", "BLOCKED", "UNDER_REVIEW"];

export const listRules = [
    query("page").optional().isInt({ min: 1, max: 10000 }).withMessage("page must be 1–10000").toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1–100").toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1–100").toInt(),
    query("type").optional().isIn(typeValues).withMessage(`type must be one of: ${typeValues.join(", ")}`),
    query("status").optional().isIn(statusValues).withMessage(`status must be one of: ${statusValues.join(", ")}`),
    query("direction").optional().isIn(["CREDIT", "DEBIT"]).withMessage("direction must be CREDIT or DEBIT"),
    query("categoryId").optional().isUUID().withMessage("Invalid category"),
    query("search").optional().isString().isLength({ max: 120 }).withMessage("search too long"),
    query("reference").optional().isString().isLength({ max: 64 }).withMessage("reference too long"),
    query("from").optional().isISO8601().withMessage("from must be an ISO date"),
    query("to").optional().isISO8601().withMessage("to must be an ISO date"),
    query("minAmount").optional().isFloat({ min: 0 }).withMessage("minAmount must be >= 0").toFloat(),
    query("maxAmount").optional().isFloat({ min: 0 }).withMessage("maxAmount must be >= 0").toFloat(),
    query("sortBy").optional().isIn(["createdAt", "amount"]).withMessage("sortBy must be createdAt or amount"),
    query("sortOrder").optional().isIn(["asc", "desc", "ASC", "DESC"]).withMessage("sortOrder must be asc or desc"),
];

export const idRules = [
    param("id").trim().notEmpty().withMessage("Transaction id or reference is required"),
];

export const exportRules = [
    query("page").optional().isInt({ min: 1, max: 10000 }).withMessage("page is ignored on export").toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize is ignored on export").toInt(),
    query("type").optional().isIn(typeValues).withMessage(`type must be one of: ${typeValues.join(", ")}`),
    query("status").optional().isIn(statusValues).withMessage(`status must be one of: ${statusValues.join(", ")}`),
    query("direction").optional().isIn(["CREDIT", "DEBIT"]).withMessage("direction must be CREDIT or DEBIT"),
    query("categoryId").optional().isUUID().withMessage("Invalid category"),
    query("search").optional().isString().isLength({ max: 120 }).withMessage("search too long"),
    query("reference").optional().isString().isLength({ max: 64 }).withMessage("reference too long"),
    query("from").optional().isISO8601().withMessage("from must be an ISO date"),
    query("to").optional().isISO8601().withMessage("to must be an ISO date"),
    query("minAmount").optional().isFloat({ min: 0 }).withMessage("minAmount must be >= 0").toFloat(),
    query("maxAmount").optional().isFloat({ min: 0 }).withMessage("maxAmount must be >= 0").toFloat(),
    query("sortBy").optional().isIn(["createdAt", "amount"]).withMessage("sortBy must be createdAt or amount"),
    query("sortOrder").optional().isIn(["asc", "desc", "ASC", "DESC"]).withMessage("sortOrder must be asc or desc"),
    query("limit").optional().isInt({ min: 1, max: 5000 }).withMessage("limit must be 1–5000").toInt(),
];

export default { listRules, idRules, exportRules };
