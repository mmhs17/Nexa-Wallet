import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

/**
 * Single shared Prisma client instance.
 * Prevents connection pool exhaustion during dev hot-reloads.
 */

const globalForPrisma = globalThis;

export const prisma =
    globalForPrisma.__nexaPrisma ||
    new PrismaClient({
        log: env.isProd ? ["error"] : ["warn", "error"],
    });

if (!env.isProd) {
    globalForPrisma.__nexaPrisma = prisma;
}

export default prisma;