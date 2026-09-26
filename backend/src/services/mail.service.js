import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * NEXA Wallet — mail service.
 * Uses SMTP when configured; otherwise logs to console (sandbox/dev).
 * Never throws for delivery failures — auth flows must not break on mail.
 */

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    if (!env.mail.host) return null;
    transporter = nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.port === 465,
        auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    });
    return transporter;
}

async function send({ to, subject, text, html }) {
    const tx = getTransporter();
    if (!tx) {
        console.log(`[NEXA mail:console] To: ${to}\nSubject: ${subject}\n${text}`);
        return { delivered: false, transport: "console" };
    }
    try {
        await tx.sendMail({ from: env.mail.from, to, subject, text, html: html || text });
        return { delivered: true, transport: "smtp" };
    } catch (err) {
        console.error("[NEXA] Mail delivery failed:", err?.message);
        return { delivered: false, transport: "smtp", error: err?.message };
    }
}

export function sendVerificationEmail({ to, name, token }) {
    const link = `${env.clientOrigin}/verify-email?token=${token}`;
    return send({
        to,
        subject: "Verify your NEXA Wallet email",
        text: `Hi ${name},\n\nWelcome to NEXA Wallet — Pay Smart. Stay Protected.\n\nVerify your email: ${link}\n\nIf you did not create this account, ignore this message.`,
    });
}

export function sendPasswordResetEmail({ to, name, token }) {
    const link = `${env.clientOrigin}/reset-password?token=${token}`;
    return send({
        to,
        subject: "Reset your NEXA Wallet password",
        text: `Hi ${name},\n\nA password reset was requested for your NEXA Wallet account.\nReset here (expires in 60 minutes): ${link}\n\nIf this was not you, secure your account immediately.`,
    });
}

export function sendNewDeviceNotice({ to, name, deviceLabel, ip }) {
    return send({
        to,
        subject: "NEXA Wallet — new device sign-in",
        text: `Hi ${name},\n\nYour NEXA Wallet account was accessed from a new device (${deviceLabel || "unknown device"}${ip ? `, IP ${ip}` : ""}).\n\nIf this was you, no action is needed. Otherwise freeze your wallet from the Security Center.`,
    });
}

export default { send, sendVerificationEmail, sendPasswordResetEmail, sendNewDeviceNotice };
