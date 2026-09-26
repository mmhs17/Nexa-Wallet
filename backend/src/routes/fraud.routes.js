import { Router } from "express";
import fraudController from "../controllers/fraud.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { paymentLimiter } from "../middleware/rateLimit.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { preflightRules, pageRules, statusRule, transactionIdRules } from "../validators/fraud.validators.js";

/**
 * NEXA Wallet — Explainable Fraud Intelligence routes (Phase 5).
 * All require auth; every payload is ownership-gated and explainable.
 */

const router = Router();
router.use(authenticate);

router.post("/preflight", paymentLimiter, validate(preflightRules), fraudController.preflight);
router.get("/assessments", validate(pageRules), fraudController.assessments);
router.get("/alerts", validate([...pageRules, ...statusRule]), fraudController.alerts);
router.get("/transactions/:transactionId/assessment", validate(transactionIdRules), fraudController.transactionAssessment);

export default router;
