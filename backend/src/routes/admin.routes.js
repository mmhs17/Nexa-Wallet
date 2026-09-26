import { Router } from "express";
import adminController from "../controllers/admin.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
    flaggedListRules,
    alertListRules,
    alertIdRules,
    resolveRules,
    userListRules,
    userIdRules,
    setStatusRules,
    auditListRules,
} from "../validators/admin.validators.js";

/**
 * NEXA Wallet — Admin Fraud Command Center routes (Phase 10).
 * Every route requires auth + ADMIN role (403 for plain users).
 */

const router = Router();
router.use(authenticate, requireAdmin);

router.get("/stats", adminController.stats);
router.get("/transactions", validate(flaggedListRules), adminController.flaggedTransactions);
router.get("/alerts", validate(alertListRules), adminController.alerts);
router.get("/alerts/:alertId", validate(alertIdRules), adminController.alertDetail);
router.post("/alerts/:alertId/claim", validate(alertIdRules), adminController.claim);
router.post("/alerts/:alertId/resolve", validate(resolveRules), adminController.resolve);
router.get("/users", validate(userListRules), adminController.users);
router.get("/users/:userId", validate(userIdRules), adminController.userDetail);
router.post("/users/:userId/status", validate(setStatusRules), adminController.setStatus);
router.get("/audit-logs", validate(auditListRules), adminController.auditLogs);

export default router;
