import { body, param, query } from "express-validator";

/** NEXA Wallet — fraud intelligence validators (Phase 5). */

export const preflightRules = [
    body("to").trim().notEmpty().withMessage("Recipient (username/email/phone/NEXA ID) is required"),
    body("amount")
        .exists().withMessage("Amount is required")
        .isFloat({ min: 1, max: 500000 }).withMessage("Amount must be between ₹1 and ₹5,00,000"),
];

export const pageRules = [
    query("page").optional().isInt({ min: 1, max: 10000 }).withMessage("page must be 1–10000").toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1–100").toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1–100").toInt(),
];

export const statusRule = [
    query("status")
        .optional()
        .isIn(["OPEN", "REVIEWING", "RESOLVED_APPROVED", "RESOLVED_REJECTED"])
        .withMessage("status must be OPEN, REVIEWING, RESOLVED_APPROVED or RESOLVED_REJECTED"),
];

export const transactionIdRules = [
    param("transactionId").trim().notEmpty().withMessage("Transaction id is required"),
];

export default { preflightRules, pageRules, statusRule, transactionIdRules };
