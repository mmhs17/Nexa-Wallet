import { AppError } from "../utils/errors.js";
import { env } from "../config/env.js";

/**
 * NEXA Wallet — centralized error handling.
 * Guarantees every error leaves the API in the standard envelope:
 *   { success: false, error: { code, message, details? } }
 */

/** Catch-all for unknown routes. Register after all routers. */
export function notFound(req, res, _next) {
    return res.status(404).json({
        success: false,
        error: {
            code: "NOT_FOUND",
            message: `Route not found: ${req.method} ${req.originalUrl}`,
        },
    });
}

/** Centralized error handler. Must be the LAST middleware. */
export function errorHandler(err, req, res, _next) {
    // Malformed JSON body (body-parser SyntaxError)
    if (err?.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err)) {
        return res.status(400).json({
            success: false,
            error: { code: "BAD_REQUEST", message: "Invalid JSON in request body" },
        });
    }

    if (err instanceof AppError) {
        if (err.statusCode >= 500) {
            console.error(`[NEXA] ${err.code} on ${req.method} ${req.originalUrl}:`, err);
        }
        return res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                ...(err.details ? { details: err.details } : {}),
            },
        });
    }

    console.error(`[NEXA] Unhandled error on ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_ERROR",
            message: env.isProd ? "Something went wrong" : err?.message || "Internal server error",
        },
    });
}

export default { notFound, errorHandler };
