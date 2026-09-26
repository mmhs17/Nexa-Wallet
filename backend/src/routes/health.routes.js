import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import { env } from "../config/env.js";

/**
 * NEXA Wallet — liveness probe. No auth, no database dependency.
 * Readiness (DB connectivity) will be added in Phase 2 alongside services.
 */

const router = Router();

router.get(
    "/",
    asyncHandler(async (_req, res) => {
        return ok(res, {
            status: "ok",
            service: "nexa-wallet-backend",
            version: "1.0.0",
            environment: env.nodeEnv,
            sandbox: env.sandbox,
            sandboxNotice: env.sandbox ? "DEMO ENVIRONMENT — NO REAL MONEY" : null,
            timestamp: new Date().toISOString(),
        });
    })
);

export default router;
