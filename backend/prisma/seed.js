/**
 * NEXA Wallet — base demo account seeder.
 *
 * Idempotent: safe to run repeatedly. Existing users are matched on username
 * and their password hash is refreshed so the documented demo credentials
 * always work. Wallets and privacy settings are created only if missing, so
 * re-seeding never resets a balance you have been testing with.
 *
 * Demo data for the UI (beneficiaries, requests, recurring payments) is seeded
 * separately by `npm run seed:demo`, which talks to a running API.
 */
import prisma from "../src/config/prisma.js";
import argon2 from "argon2";

const PASSWORD = "Test@1234";

const USERS = [
    { username: "friend1", fullName: "Friend One", nexaId: "NEXA-C5XT4", email: "friend1@nexa.local", phone: "+918888888888", balance: "20000.00" },
    { username: "friend2", fullName: "Friend Two", nexaId: "NEXA-D8K2M", email: "friend2@nexa.local", phone: "+918888888889", balance: "15000.00" },
    { username: "phase4other", fullName: "Phase Other", nexaId: "NEXA-GFKDM", email: "phase4other@nexa.local", phone: "+918888888890", balance: "10000.00" },
    { username: "phase4test", fullName: "Phase Test", nexaId: "NEXA-H3R9P", email: "phase4test@nexa.local", phone: "+918888888891", balance: "10000.00" },
    { username: "phase5main", fullName: "Phase Five Main", nexaId: "NEXA-J7N4Q", email: "phase5main@nexa.local", phone: "+918888888892", balance: "10000.00" },
];

const created = [];
const existing = [];

for (const u of USERS) {
    const passwordHash = await argon2.hash(PASSWORD);
    const wasThere = await prisma.user.findUnique({
        where: { username: u.username },
        select: { id: true },
    });

    const row = await prisma.user.upsert({
        where: { username: u.username },
        // nexaId/email/phone are all @unique, so only ever set them on create.
        // Re-assigning them on update would collide with another seeded user.
        update: { passwordHash, fullName: u.fullName, status: "ACTIVE" },
        create: {
            nexaId: u.nexaId,
            username: u.username,
            email: u.email,
            phone: u.phone,
            passwordHash,
            fullName: u.fullName,
            role: "USER",
            status: "ACTIVE",
            emailVerified: true,
        },
        select: { id: true },
    });

    // Wallet + privacy settings are create-if-missing so balances survive reseeds.
    await prisma.wallet.upsert({
        where: { userId: row.id },
        update: {},
        create: { userId: row.id, balance: u.balance, currency: "INR", status: "ACTIVE" },
    });
    await prisma.privacySettings.upsert({
        where: { userId: row.id },
        update: {},
        create: { userId: row.id, shieldActive: false, hideBalance: false, hideTransactionAmounts: false },
    });

    (wasThere ? existing : created).push(u.username);
}

console.log(`\nNEXA Wallet - demo accounts ready (password for all: ${PASSWORD})\n`);
for (const u of USERS) {
    const mark = created.includes(u.username) ? "+ created" : "~ existing";
    console.log(`  ${mark.padEnd(11)} ${u.username.padEnd(14)} ${u.nexaId.padEnd(11)} ${u.email}`);
}
console.log(`\n${created.length} created, ${existing.length} already present.`);
console.log("UI demo data: run `npm run seed:demo` with the API running.\n");

await prisma.$disconnect();
