import { Router } from "express";
import walletController from "../controllers/wallet.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authLimiter, paymentLimiter } from "../middleware/rateLimit.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { addMoneyRules, withdrawRules, sendRules, recipientRules, resolveRules, lockRules, unlockRules } from "../validators/wallet.validators.js";

/**
 * NEXA Wallet — wallet + P2P routes. All require auth.
 * Money movements additionally pass through the payment rate limiter.
 * Emergency-lock endpoints live here: unlock is authLimiter-gated
 * because it verifies a password.
 */

const router = Router();
router.use(authenticate);

router.get("/", walletController.getWallet);
router.get("/categories", walletController.categories);
router.get("/recipients/resolve", validate(resolveRules), walletController.resolveRecipient);
router.get("/recipients/:identifier", validate(recipientRules), walletController.recipientProfile);
router.get("/security/lock", walletController.lockStatus);
router.post("/security/lock", validate(lockRules), walletController.lock);
router.post("/security/unlock", authLimiter, validate(unlockRules), walletController.unlock);
router.post("/add-money", paymentLimiter, validate(addMoneyRules), walletController.addMoney);
router.post("/withdraw", paymentLimiter, validate(withdrawRules), walletController.withdraw);
router.post("/send", paymentLimiter, validate(sendRules), walletController.send);

export default router;
