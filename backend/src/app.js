import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimit.middleware.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";
import apiRoutes from "./routes/index.js";

/**
 * NEXA Wallet — Express application factory wiring.
 * Pay Smart. Stay Protected.
 */

const app = express();

app.set("trust proxy", 1); // correct client IPs behind proxies (rate limiting, audit)
app.disable("x-powered-by");

app.use(helmet());
app.use(
    cors({
        // Dev-friendly: accept every localhost-class origin so the app works
        // from localhost, 127.0.0.1, LAN IPs, etc. Production pins CLIENT_ORIGIN.
        origin: env.isProd ? env.clientOrigin : true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Device-Id"],
    })
);
app.use(morgan(env.isProd ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Global API throttle (stricter limiters apply per-router in later phases)
app.use("/api", apiLimiter);
app.use("/api", apiRoutes);

// Unknown routes -> 404 JSON, then centralized error handling (last)
app.use(notFound);
app.use(errorHandler);

export default app;
