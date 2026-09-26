import { query, param, body } from "express-validator";

/** NEXA Wallet — Security Center validators (Phase 7). */

export const eventListRules = [
    query("page").optional().isInt({ min: 1, max: 10000 }).withMessage("page must be 1–10000").toInt(),
    query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be 1–100").toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1–100").toInt(),
    query("type")
        .optional()
        .isIn([
            "LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET",
            "TWO_FA_ENABLED", "TWO_FA_DISABLED", "TWO_FA_VERIFIED", "NEW_DEVICE", "SUSPICIOUS_LOGIN",
            "WALLET_FROZEN", "WALLET_UNFROZEN", "PAYMENT_BLOCKED", "PAYMENT_VERIFIED",
            "SESSION_REVOKED", "ACCOUNT_LOCKED", "RECOVERY_CODE_USED",
        ])
        .withMessage("Unknown security event type"),
    query("severity").optional().isIn(["INFO", "WARNING", "CRITICAL"]).withMessage("severity must be INFO, WARNING or CRITICAL"),
    query("since").optional().isISO8601().withMessage("since must be an ISO date"),
];

export const sessionIdRules = [
    param("sessionId").trim().notEmpty().withMessage("sessionId is required"),
];

const pinBody = [
    body("pin")
        .exists({ checkFalsy: true }).withMessage("Security key is required")
        .isString().matches(/^\d{4}$/).withMessage("Security key must be exactly 4 digits"),
];

export const txPinRules = {
    /* Creating / changing the key also needs the account password. */
    set: [
        ...pinBody,
        body("password").exists({ checkFalsy: true }).withMessage("Account password is required"),
    ],
    /* Removing only needs the account password. */
    remove: [
        body("password").exists({ checkFalsy: true }).withMessage("Account password is required"),
    ],
};

export default { eventListRules, sessionIdRules, txPinRules };
