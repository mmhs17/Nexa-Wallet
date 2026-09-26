import { Router } from "express";
import securityController from "../controllers/security.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { eventListRules, sessionIdRules, txPinRules } from "../validators/security.validators.js";

/**
 * NEXA Wallet — Security Center routes (Phase 7). All require auth.
 * NOTE: /sessions/revoke-all must be registered BEFORE /sessions/:sessionId.
 */

const router = Router();
router.use(authenticate);

router.get("/overview", securityController.overview);
router.get("/events", validate(eventListRules), securityController.events);
router.post("/sessions/revoke-all", securityController.revokeAllOthers);
router.get("/sessions", securityController.sessions);
router.delete("/sessions/:sessionId", validate(sessionIdRules), securityController.revokeSession);

/* Transaction security key (4-digit TX PIN) */
router.get("/tx-pin", securityController.txPinStatus);
router.post("/tx-pin", validate(txPinRules.set), securityController.setTxPin);
router.delete("/tx-pin", validate(txPinRules.remove), securityController.clearTxPin);

export default router;
