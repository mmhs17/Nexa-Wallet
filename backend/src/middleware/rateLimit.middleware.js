import rateLimit from "express-rate-limit";

/**
 * NEXA Wallet — rate limiters (express-rate-limit v7).
 * All limiters answer in the standard { success:false, error } envelope.
 */

function jsonHandler(message) {
    return (_req, res) =>
        res.status(429).json({
            success: false,
            error: { code: "RATE_LIMITED", message },
        });
}

function build({ windowMs, limit, message }) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        handler: jsonHandler(message),
    });
}

/** General API protection: 300 requests / 15 min per IP. */
export const apiLimiter = build({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    message: "Too many requests. Please slow down and try again.",
});

/** Strict limiter for auth endpoints (brute-force protection): 30 / 15 min. */
export const authLimiter = build({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: "Too many authentication attempts. Please try again later.",
});

/** Payment endpoints: 20 money movements / minute per IP. */
export const paymentLimiter = build({
    windowMs: 60 * 1000,
    limit: 20,
    message: "Too many payment attempts. Please wait a moment and retry.",
});

export default { apiLimiter, authLimiter, paymentLimiter };
