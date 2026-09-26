/**
 * NEXA Wallet — typed application errors.
 * Centralizes HTTP status mapping so controllers can throw cleanly.
 */

export class AppError extends Error {
    constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace?.(this, this.constructor);
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Bad request", details = null) {
        super(message, 400, "BAD_REQUEST", details);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Authentication required", details = null) {
        super(message, 401, "UNAUTHORIZED", details);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Access denied", details = null) {
        super(message, 403, "FORBIDDEN", details);
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found", details = null) {
        super(message, 404, "NOT_FOUND", details);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Resource conflict", details = null) {
        super(message, 409, "CONFLICT", details);
    }
}

export class UnprocessableError extends AppError {
    constructor(message = "Unprocessable entity", details = null) {
        super(message, 422, "UNPROCESSABLE", details);
    }
}

/**
 * Incorrect / locked-out transaction security key.
 *
 * Deliberately NOT a 401: the access token is still perfectly valid, so the
 * client must not treat this as an expired session and attempt a token
 * refresh (which would replay the payment and burn a second key attempt).
 * 422 keeps it on the normal error path.
 */
export class TxPinError extends AppError {
    constructor(message = "Incorrect security key", details = null) {
        super(message, 422, "TX_PIN_INVALID", details);
    }
}

export class TooManyRequestsError extends AppError {
    constructor(message = "Too many requests", details = null) {
        super(message, 429, "RATE_LIMITED", details);
    }
}

export class WalletLockedError extends AppError {
    constructor(message = "Wallet is frozen. Payment activity is restricted.", details = null) {
        super(message, 423, "WALLET_FROZEN", details);
    }
}

export class PaymentBlockedError extends AppError {
    constructor(message = "Payment blocked by NEXA Risk Engine", details = null) {
        super(message, 402, "PAYMENT_BLOCKED", details);
    }
}