import { Router } from "express";
import transactionController from "../controllers/transaction.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { listRules, idRules, exportRules } from "../validators/transaction.validators.js";

/**
 * NEXA Wallet — transaction ledger routes (Phase 4). All require auth.
 * NOTE: `/export` and `/receipt` must be registered BEFORE `/:id`,
 * otherwise Express would treat "export" as an id.
 */

const router = Router();
router.use(authenticate);

router.get("/export", validate(exportRules), transactionController.exportCsv);
router.get("/:id/receipt", validate(idRules), transactionController.receipt);
router.get("/:id", validate(idRules), transactionController.detail);
router.get("/", validate(listRules), transactionController.list);

export default router;
