import { query } from "express-validator";

/** NEXA Wallet — Financial Analytics validators (Phase 8). */

const periodRule = query("period")
    .optional()
    .isIn(["7d", "30d", "90d", "6m", "1y", "all"])
    .withMessage("period must be 7d, 30d, 90d, 6m, 1y or all");

export const periodRules = [
    periodRule,
    query("from").optional().isISO8601().withMessage("from must be an ISO date"),
];

export default { periodRules };
