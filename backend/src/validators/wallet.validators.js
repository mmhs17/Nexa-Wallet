import { body, param, query } from "express-validator";

/** NEXA Wallet — wallet + P2P validators. */

const amountRule = body("amount")
    .exists().withMessage("Amount is required")
    .isFloat({ min: 1, max: 500000 }).withMessage("Amount must be between ₹1 and ₹5,00,000");

export const addMoneyRules = [
    amountRule,
    body("method").optional().isIn(["UPI", "CARD", "NETBANKING", "WALLET", "RAZORPAY", "STRIPE"]).withMessage("Invalid method"),
    body("note").optional().isString().isLength({ max: 200 }).withMessage("Note too long"),
    body("categoryId").optional().isUUID().withMessage("Invalid category"),
];

export const withdrawRules = [
    amountRule,
    body("destination").optional().isString().isLength({ max: 120 }).withMessage("Destination too long"),
    body("note").optional().isString().isLength({ max: 200 }).withMessage("Note too long"),
];

export const sendRules = [
    body("to").trim().notEmpty().withMessage("Recipient (username/email/phone/NEXA ID) is required"),
    amountRule,
    body("note").optional().isString().isLength({ max: 200 }).withMessage("Note too long"),
    body("categoryId").optional().isUUID().withMessage("Invalid category"),
    /* 4-digit security key — only required when the user has opted in. */
    body("pin").optional().isString().isLength({ min: 4, max: 8 }).withMessage("Security key must be 4 digits"),
];

export const recipientRules = [
    param("identifier").trim().notEmpty().withMessage("Recipient identifier is required"),
];

export const resolveRules = [
    query("q").trim().notEmpty().withMessage("Search query is required"),
];

export const lockRules = [
    body("reason").optional().isString().isLength({ max: 140 }).withMessage("Reason too long"),
];

export const unlockRules = [
    body("password").exists().withMessage("Password is required").isString().notEmpty().withMessage("Password is required"),
];

export default { addMoneyRules, withdrawRules, sendRules, recipientRules, resolveRules, lockRules, unlockRules };
