import dotenv from "dotenv";

dotenv.config();

/**
 * NEXA Wallet — centralized, validated environment configuration.
 * All process.env access should funnel through this module.
 */

function required(name, fallback = undefined) {
    const value = process.env[name] ?? fallback;
    if (value === undefined || value === "") {
        // In development we allow sensible fallbacks; in production we fail fast.
        if (process.env.NODE_ENV === "production") {
            throw new Error(`Missing required environment variable: ${name}`);
        }
        return fallback;
    }
    return value;
}

export const env = {
    nodeEnv: process.env.NODE_ENV || "development",
    isProd: (process.env.NODE_ENV || "development") === "production",
    port: Number(process.env.PORT || 4000),
    clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",

    databaseUrl: required("DATABASE_URL"),

    jwt: {
        accessSecret: required("JWT_ACCESS_SECRET", "dev_access_secret_change_me"),
        refreshSecret: required("JWT_REFRESH_SECRET", "dev_refresh_secret_change_me"),
        accessTtl: process.env.JWT_ACCESS_TTL || "15m",
        refreshTtl: process.env.JWT_REFRESH_TTL || "7d",
    },

    encryptionKey: required(
        "ENCRYPTION_KEY",
        "0000000000000000000000000000000000000000000000000000000000000000"
    ),

    security: {
        maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
        accountLockMinutes: Number(process.env.ACCOUNT_LOCK_MINUTES || 15),
    },

    mail: {
        from: process.env.MAIL_FROM || "NEXA Wallet <no-reply@nexa.local>",
        host: process.env.SMTP_HOST || "",
        port: Number(process.env.SMTP_PORT || 587),
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
    },

    gateways: {
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
        razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
        stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    },

            sandbox: (process.env.SANDBOX_MODE || "true") === "true",

    openRouter: {
        apiKey: process.env.OPENROUTER_API_KEY || "",
        model: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash:free",
        baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    },
};

export default env;