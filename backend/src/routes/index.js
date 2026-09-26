import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import walletRoutes from "./wallet.routes.js";
import transactionRoutes from "./transaction.routes.js";
import fraudRoutes from "./fraud.routes.js";
import privacyRoutes from "./privacy.routes.js";
import securityRoutes from "./security.routes.js";
import analyticsRoutes from "./analytics.routes.js";
import intelligenceRoutes from "./intelligence.routes.js";
import adminRoutes from "./admin.routes.js";
import extrasRoutes from "./extras.routes.js";

/**
 * NEXA Wallet — API router.
 * Feature routers (wallet, transactions, fraud, …) mount here
 * as they land in Phases 3–11.
 */
const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/wallet", walletRoutes);
router.use("/transactions", transactionRoutes);
router.use("/fraud", fraudRoutes);
router.use("/privacy", privacyRoutes);
router.use("/security", securityRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/intelligence", intelligenceRoutes);
router.use("/admin", adminRoutes);

/**
 * Phase 11 user-side resources. The extras router owns absolute paths
 * (/notifications, /beneficiaries, /requests, /recurring-payments), so it
 * mounts at the API root and last, after every prefixed feature router.
 */
router.use("/", extrasRoutes);

export default router;
