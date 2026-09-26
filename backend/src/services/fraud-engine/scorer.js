import { evaluatePayment } from "./rules.js";

/**
 * NEXA Wallet — fraud-engine self-test (no DB, no server).
 * `node src/services/fraud-engine/scorer.js` prints the rule table
 * plus three worked examples so reviewers can eyeball the bands.
 */

function show(title, score) {
    console.log(`\n## ${title}`);
    console.log(`score=${score.score} level=${score.level} decision=${score.decision}`);
    for (const f of score.factors) console.log(`  +${String(f.points).padStart(2)} ${f.code} — ${f.detail}`);
    console.log(`  -> ${score.recommendation}`);
}

const base = {
    amount: 500,
    recipientTxnCount: 10,
    sender: { emailVerified: true, createdAt: new Date("2024-01-01T10:00:00Z") },
    recentCount15m: 0,
    dayCount: 1,
    dayTotal: 500,
    isNewDevice: false,
    now: new Date("2026-09-15T14:00:00"),
};

show("Clean weekday coffee (expect ALLOW, ~0)", evaluatePayment(base));
show(
    "First-time ₹60k to stranger (expect REVIEW, ~70)",
    evaluatePayment({ ...base, amount: 60000, recipientTxnCount: 0 })
);
show(
    "Fresh unverified account, new device, rapid ₹1.2L at 2am (expect BLOCK)",
    evaluatePayment({
        amount: 120000,
        recipientTxnCount: 0,
        sender: { emailVerified: false, createdAt: new Date(Date.now() - 3600 * 1000) },
        recentCount15m: 4,
        dayCount: 6,
        dayTotal: 200000,
        isNewDevice: true,
        now: new Date("2026-09-15T02:15:00"),
    })
);
