import { Router } from "express";
import analyticsController from "../controllers/analytics.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { periodRules } from "../validators/analytics.validators.js";

/**
 * NEXA Wallet — Financial Analytics routes (Phase 8). All require auth.
 * Every computation is scoped to the signed-in user's own ledger.
 */

const router = Router();
router.use(authenticate);

router.get("/summary", validate(periodRules), analyticsController.summary);
router.get("/spending", validate(periodRules), analyticsController.spending);
router.get("/counterparties", validate(periodRules), analyticsController.counterparties);
router.get("/trends", validate(periodRules), analyticsController.trends);
router.get("/insights", validate(periodRules), analyticsController.insights);

export default router;
