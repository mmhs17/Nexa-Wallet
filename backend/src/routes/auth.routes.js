import { Router } from "express";
import authController from "../controllers/auth.controller.js";
import twoFactorController from "../controllers/twoFactor.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimit.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
    registerRules,
    loginRules,
    verifyEmailRules,
    resendVerificationRules,
    refreshRules,
    forgotPasswordRules,
    resetPasswordRules,
    changePasswordRules,
    twoFaSetupConfirmRules,
    twoFaVerifyRules,
    twoFaDisableRules,
    twoFaRegenerateRules,
} from "../validators/auth.validators.js";

/**
 * NEXA Wallet — authentication routes.
 * Public: register / verify / login / refresh / 2FA verify / password reset.
 * Private (Bearer or nexa_access cookie): me / logout / password change / 2FA setup.
 */

const router = Router();

// Credential + enumeration-sensitive endpoints get the strict limiter.
router.post("/register", authLimiter, validate(registerRules), authController.register);
router.post("/verify-email", authLimiter, validate(verifyEmailRules), authController.verifyEmail);
router.post("/resend-verification", authLimiter, validate(resendVerificationRules), authController.resendVerification);
router.post("/login", authLimiter, validate(loginRules), authController.login);
router.post("/refresh", validate(refreshRules), authController.refresh);
router.post("/2fa/verify", authLimiter, validate(twoFaVerifyRules), twoFactorController.verify);
router.post("/forgot-password", authLimiter, validate(forgotPasswordRules), authController.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordRules), authController.resetPassword);

// Authenticated self-service.
router.get("/me", authenticate, authController.me);
router.post("/reissue", authenticate, authController.reissue);
router.post("/logout", authenticate, authController.logout);
router.post("/change-password", authenticate, validate(changePasswordRules), authController.changePassword);

// 2FA management (authenticated).
router.get("/2fa/status", authenticate, twoFactorController.status);
router.post("/2fa/setup", authenticate, twoFactorController.beginSetup);
router.post("/2fa/confirm", authenticate, validate(twoFaSetupConfirmRules), twoFactorController.confirmSetup);
router.post("/2fa/disable", authenticate, validate(twoFaDisableRules), twoFactorController.disable);
router.post("/2fa/recovery-codes", authenticate, validate(twoFaRegenerateRules), twoFactorController.regenerateCodes);

export default router;
