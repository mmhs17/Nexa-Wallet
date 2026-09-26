import { body } from "express-validator";

/** NEXA Wallet — Privacy Shield validators (Phase 6). */

const bool = (name) =>
    body(name).optional().isBoolean().withMessage(`${name} must be a boolean`).toBoolean();

export const updateRules = [
    bool("shieldActive"),
    bool("hideBalance"),
    bool("hideTransactionAmounts"),
    bool("hideRecipientNames"),
    bool("hideAnalytics"),
    body("autoLockMinutes")
        .optional()
        .isInt({ min: 1, max: 120 })
        .withMessage("autoLockMinutes must be an integer between 1 and 120")
        .toInt(),
];

export default { updateRules };
