import { body, query } from "express-validator";

/** NEXA Wallet — NEXA Intelligence Assistant validators (Phase 9). */

export const chatRules = [
    body("message")
        .trim()
        .notEmpty()
        .withMessage("Message is required")
        .isLength({ max: 2000 })
        .withMessage("Message must be 2000 characters or fewer"),
];

export const contextRules = [];

export default { chatRules, contextRules };