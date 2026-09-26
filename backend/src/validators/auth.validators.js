import { body } from "express-validator";

/**
 * NEXA Wallet — auth + 2FA request validators. Wired through
 * validate.middleware so failures become 422 AppErrors.
 */

const passwordRule = body("password")
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be 8–128 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must include an uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must include a lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must include a number");

const newPasswordRule = body("newPassword")
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage("New password must be 8–128 characters")
    .matches(/[A-Z]/)
    .withMessage("New password must include an uppercase letter")
    .matches(/[a-z]/)
    .withMessage("New password must include a lowercase letter")
    .matches(/[0-9]/)
    .withMessage("New password must include a number");

export const registerRules = [
    body("username")
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage("Username must be 3–30 characters")
        .matches(/^[a-zA-Z0-9_.-]+$/)
        .withMessage("Username may contain letters, numbers, dot, underscore or hyphen"),
    body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("phone")
        .optional({ nullable: true })
        .trim()
        .matches(/^[+]?[0-9]{7,15}$/)
        .withMessage("Phone must be 7–15 digits with optional leading +"),
    passwordRule,
    body("fullName").trim().isLength({ min: 2, max: 80 }).withMessage("Full name is required"),
];

export const loginRules = [
    body("identifier").trim().notEmpty().withMessage("Email, username or phone is required"),
    body("password").isString().notEmpty().withMessage("Password is required"),
];

export const verifyEmailRules = [
    body("token").trim().notEmpty().withMessage("Verification token is required"),
];

export const resendVerificationRules = [
    body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
];

export const refreshRules = [
    body("refreshToken")
        .optional()
        .isString()
        .withMessage("Refresh token must be a string"),
];

export const forgotPasswordRules = [
    body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
];

export const resetPasswordRules = [
    body("token").trim().notEmpty().withMessage("Reset token is required"),
    newPasswordRule,
];

export const changePasswordRules = [
    body("currentPassword").isString().notEmpty().withMessage("Current password is required"),
    newPasswordRule,
    body("confirmPassword")
        .optional()
        .custom((value, { req }) => {
            if (value !== undefined && value !== req.body.newPassword) {
                throw new Error("Passwords do not match");
            }
            return true;
        }),
];

export const twoFaSetupConfirmRules = [
    body("token")
        .trim()
        .isLength({ min: 6, max: 8 })
        .withMessage("6-digit verification code is required"),
];

export const twoFaVerifyRules = [
    body("pendingSessionId").trim().notEmpty().withMessage("pendingSessionId is required"),
    body("token").optional().trim().isLength({ min: 6, max: 8 }).withMessage("Invalid code"),
    body("recoveryCode").optional().trim().notEmpty(),
];

export const twoFaDisableRules = [
    body("password").isString().notEmpty().withMessage("Password is required to disable 2FA"),
];

export const twoFaRegenerateRules = [
    body("password").isString().notEmpty().withMessage("Password is required"),
];

export default {
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
};
