import { Router } from "express";
import privacyController from "../controllers/privacy.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { updateRules } from "../validators/privacy.validators.js";

/** NEXA Wallet — Privacy Shield routes (Phase 6). All require auth. */

const router = Router();
router.use(authenticate);

router.get("/", privacyController.get);
router.put("/", validate(updateRules), privacyController.update);

export default router;
