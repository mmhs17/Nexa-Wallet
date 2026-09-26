import { Router } from "express";
import extrasController from "../controllers/extras.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { paymentLimiter } from "../middleware/rateLimit.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { body, param, query } from "express-validator";

/**
 * NEXA Wallet — extras routes (Phase 11 support).
 * /notifications, /beneficiaries, /requests, /recurring-payments.
 * All require auth; request-accept goes through the payment limiter
 * because it moves real money via the P2P engine.
 */

const router = Router();
router.use(authenticate);

const idParam = param("id").trim().notEmpty().withMessage("id is required");

/* Notifications */
router.get("/notifications", extrasController.listNotifications);
router.post("/notifications/read-all", extrasController.markAllRead);
router.post("/notifications/:id/read", validate([idParam]), extrasController.markRead);

/* Beneficiaries */
router.get("/beneficiaries", extrasController.listBeneficiaries);
router.post(
    "/beneficiaries",
    validate([
        body("identifier").trim().notEmpty().withMessage("Recipient identifier is required"),
        body("nickname").optional({ nullable: true }).isString().isLength({ max: 80 }).withMessage("Nickname too long"),
        body("isFavorite").optional({ nullable: true }).isBoolean().withMessage("isFavorite must be boolean").toBoolean(),
    ]),
    extrasController.createBeneficiary
);
router.put(
    "/beneficiaries/:id",
    validate([
        idParam,
        body("nickname").optional({ nullable: true }).isString().isLength({ max: 80 }).withMessage("Nickname too long"),
        body("isFavorite").optional({ nullable: true }).isBoolean().withMessage("isFavorite must be boolean").toBoolean(),
    ]),
    extrasController.updateBeneficiary
);
router.delete("/beneficiaries/:id", validate([idParam]), extrasController.deleteBeneficiary);

/* Payment requests */
router.get("/requests", validate([query("box").optional().isIn(["received", "sent"]).withMessage("box must be received or sent")]), extrasController.listRequests);
router.post(
    "/requests",
    validate([
        body("to").trim().notEmpty().withMessage("Recipient (username/email/phone/NEXA ID) is required"),
        body("amount").exists().withMessage("Amount is required").isFloat({ min: 1, max: 500000 }).withMessage("Amount must be between ₹1 and ₹5,00,000"),
        body("note").optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage("Note too long"),
    ]),
    extrasController.createRequest
);
router.post(
    "/requests/:id/:action",
    paymentLimiter,
    validate([
        idParam,
        param("action").isIn(["accept", "reject", "cancel"]).withMessage("action must be accept, reject or cancel"),
    ]),
    extrasController.respondRequest
);

/* Recurring payments */
router.get("/recurring-payments", extrasController.listRecurring);
router.post(
    "/recurring-payments",
    validate([
        body("to").trim().notEmpty().withMessage("Recipient (username/email/phone/NEXA ID) is required"),
        body("amount").exists().withMessage("Amount is required").isFloat({ min: 1, max: 500000 }).withMessage("Amount must be between ₹1 and ₹5,00,000"),
        body("frequency").optional({ nullable: true }).isIn(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]).withMessage("Invalid frequency"),
        body("note").optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage("Note too long"),
    ]),
    extrasController.createRecurring
);
router.post("/recurring-payments/:id/pause", validate([idParam]), extrasController.pauseRecurring);
router.post("/recurring-payments/:id/resume", validate([idParam]), extrasController.resumeRecurring);
router.delete("/recurring-payments/:id", validate([idParam]), extrasController.deleteRecurring);

export default router;