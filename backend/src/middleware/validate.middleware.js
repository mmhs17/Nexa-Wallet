import { validationResult } from "express-validator";
import { UnprocessableError } from "../utils/errors.js";

/**
 * NEXA Wallet — express-validator wrapper.
 * Usage: router.post("/", validate([body("email").isEmail(), ...]), handler)
 * Converts validation failures into a 422 AppError the error middleware understands.
 */
export function validate(rules = []) {
    return [
        ...rules,
        (req, _res, next) => {
            const result = validationResult(req);
            if (!result.isEmpty()) {
                throw new UnprocessableError(
                    "Validation failed",
                    result.array().map((e) => ({ field: e.path, message: e.msg, value: e.value }))
                );
            }
            return next();
        },
    ];
}

export default validate;
