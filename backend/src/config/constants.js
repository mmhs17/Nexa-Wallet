/**
 * NEXA Wallet — shared constants and enums mirrored from Prisma.
 * Keeping these in one place avoids magic strings across the codebase.
 */

export const ROLES = Object.freeze({
    USER: "USER",
    ADMIN: "ADMIN",
});

export const WALLET_STATUS = Object.freeze({
    ACTIVE: "ACTIVE",
    FROZEN: "FROZEN",
    CLOSED: "CLOSED",
});

export const TRANSACTION_STATUS = Object.freeze({
    COMPLETED: "COMPLETED",
    PENDING: "PENDING",
    FAILED: "FAILED",
    REVERSED: "REVERSED",
    BLOCKED: "BLOCKED",
    UNDER_REVIEW: "UNDER_REVIEW",
});

export const TRANSACTION_TYPE = Object.freeze({
    SEND: "SEND",
    RECEIVE: "RECEIVE",
    ADD_MONEY: "ADD_MONEY",
    WITHDRAW: "WITHDRAW",
    REQUEST: "REQUEST",
    REFUND: "REFUND",
});

export const RISK_LEVEL = Object.freeze({
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
});

export const RISK_THRESHOLDS = Object.freeze({
    LOW_MAX: 30,
    MEDIUM_MAX: 70,
});

export const REQUEST_STATUS = Object.freeze({
    PENDING: "PENDING",
    ACCEPTED: "ACCEPTED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
});

export const RECURRING_FREQUENCY = Object.freeze({
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
    QUARTERLY: "QUARTERLY",
    YEARLY: "YEARLY",
});

export const SECURITY_EVENT = Object.freeze({
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAILED: "LOGIN_FAILED",
    LOGOUT: "LOGOUT",
    PASSWORD_CHANGED: "PASSWORD_CHANGED",
    PASSWORD_RESET: "PASSWORD_RESET",
    TWO_FA_ENABLED: "TWO_FA_ENABLED",
    TWO_FA_DISABLED: "TWO_FA_DISABLED",
    TWO_FA_VERIFIED: "TWO_FA_VERIFIED",
    NEW_DEVICE: "NEW_DEVICE",
    SUSPICIOUS_LOGIN: "SUSPICIOUS_LOGIN",
    WALLET_FROZEN: "WALLET_FROZEN",
    WALLET_UNFROZEN: "WALLET_UNFROZEN",
    PAYMENT_BLOCKED: "PAYMENT_BLOCKED",
    PAYMENT_VERIFIED: "PAYMENT_VERIFIED",
    SESSION_REVOKED: "SESSION_REVOKED",
    ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
    RECOVERY_CODE_USED: "RECOVERY_CODE_USED",
});

export const SECURITY_SEVERITY = Object.freeze({
    INFO: "INFO",
    WARNING: "WARNING",
    CRITICAL: "CRITICAL",
});

export const NOTIFICATION_TYPE = Object.freeze({
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
    PAYMENT_SENT: "PAYMENT_SENT",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    PAYMENT_BLOCKED: "PAYMENT_BLOCKED",
    FRAUD_ALERT: "FRAUD_ALERT",
    NEW_LOGIN: "NEW_LOGIN",
    NEW_DEVICE: "NEW_DEVICE",
    PASSWORD_CHANGED: "PASSWORD_CHANGED",
    TWO_FA_CHANGE: "TWO_FA_CHANGE",
    WALLET_FREEZE: "WALLET_FREEZE",
    PAYMENT_REQUEST: "PAYMENT_REQUEST",
    RECURRING_REMINDER: "RECURRING_REMINDER",
    SYSTEM: "SYSTEM",
});

export const FRAUD_ALERT_STATUS = Object.freeze({
    OPEN: "OPEN",
    REVIEWING: "REVIEWING",
    RESOLVED_APPROVED: "RESOLVED_APPROVED",
    RESOLVED_REJECTED: "RESOLVED_REJECTED",
});

export const DEFAULT_CATEGORIES = Object.freeze([
    { name: "Food", slug: "food", icon: "utensils", color: "#f97316" },
    { name: "Shopping", slug: "shopping", icon: "shopping-bag", color: "#8b5cf6" },
    { name: "Travel", slug: "travel", icon: "plane", color: "#0ea5e9" },
    { name: "Bills", slug: "bills", icon: "receipt", color: "#ef4444" },
    { name: "Education", slug: "education", icon: "graduation-cap", color: "#22c55e" },
    { name: "Entertainment", slug: "entertainment", icon: "clapperboard", color: "#ec4899" },
    { name: "Transfers", slug: "transfers", icon: "arrow-left-right", color: "#14b8a6" },
    { name: "Other", slug: "other", icon: "ellipsis", color: "#64748b" },
]);

/** Emergency lock: minutes before a self-locked wallet can be unlocked. */
export const UNLOCK_COOLDOWN_MINUTES = 30;

export const CURRENCY = "INR";