import { Router } from "express";
import intelligenceController from "../controllers/intelligence.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { paymentLimiter } from "../middleware/rateLimit.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { chatRules } from "../validators/intelligence.validators.js";

/**
 * NEXA Wallet — NEXA Intelligence Assistant routes (Phase 9).
 * All require auth; the chat endpoint is gated by the payment limiter
 * so it cannot be abused as a compute vector.
 */
const router = Router();
router.use(authenticate);

router.get("/context", intelligenceController.context);
router.post("/chat", paymentLimiter, validate(chatRules), intelligenceController.chat);

export default router;
