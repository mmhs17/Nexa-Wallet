/* One-off: print real demo identifiers for the Send/Receive quick-pick UI. */
import prisma from "./src/config/prisma.js";

const users = await prisma.user.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    select: { username: true, email: true, phone: true, nexaId: true, fullName: true },
});
console.log("=== USERS ===");
for (const u of users) console.log(JSON.stringify(u));

const txns = await prisma.transaction.findMany({
    take: 6,
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, type: true, status: true, amount: true },
});
console.log("=== TRANSACTIONS ===");
for (const t of txns) console.log(JSON.stringify({ ...t, amount: String(t.amount) }));

await prisma.$disconnect();
