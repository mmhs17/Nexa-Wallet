import http from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";

/**
 * NEXA Wallet — API entry point.
 * `npm run dev` (watch) / `npm start`
 */

const server = http.createServer(app);

server.listen(env.port, () => {
    console.log("============================================================");
    console.log("  NEXA WALLET API — Pay Smart. Stay Protected.");
    console.log(`  Environment : ${env.nodeEnv}`);
    console.log(`  Listening   : http://localhost:${env.port}/api/health`);
    if (env.sandbox) console.log("  Mode        : DEMO ENVIRONMENT — NO REAL MONEY");
    console.log("============================================================");
});

function shutdown(signal) {
    console.log(`[NEXA] Received ${signal}, shutting down gracefully…`);
    server.close(async () => {
        try {
            // Disconnect Prisma only if it was ever instantiated (lazy import
            // so the server can boot even before `prisma generate` has run).
            const { default: prisma } = await import("./config/prisma.js");
            await prisma.$disconnect();
        } catch {
            // Prisma client unavailable — nothing to disconnect.
        }
        console.log("[NEXA] Server stopped.");
        process.exit(0);
    });

    // Force-exit if connections hang.
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Belt-and-braces: a stray rejected promise must never kill the API.
// (Express 4 does not catch async middleware rejections itself.)
process.on("unhandledRejection", (reason) => {
    console.error("[NEXA] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[NEXA] Uncaught exception:", err);
});

export default server;
