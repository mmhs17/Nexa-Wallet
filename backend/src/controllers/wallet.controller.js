import * as walletService from "../services/wallet.service.js";
import { getClientInfo } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, created, serialize } from "../utils/response.js";

/** NEXA Wallet — wallet + P2P controller (thin HTTP layer). */

export const getWallet = asyncHandler(async (req, res) => {
    return ok(res, serialize(await walletService.getWallet(req.user.id)));
});

export const addMoney = asyncHandler(async (req, res) => {
    const result = await walletService.addMoney(req.user.id, req.body, getClientInfo(req));
    return created(res, serialize(result));
});

export const withdraw = asyncHandler(async (req, res) => {
    const result = await walletService.withdraw(req.user.id, req.body, getClientInfo(req));
    return created(res, serialize(result));
});

export const send = asyncHandler(async (req, res) => {
    const result = await walletService.sendMoney(req.user.id, req.body, getClientInfo(req));
    return created(res, serialize(result));
});

export const resolveRecipient = asyncHandler(async (req, res) => {
    const user = await walletService.resolveRecipient(req.query.q);
    const profile = await walletService.getRecipientProfile(req.user.id, req.query.q);
    void user;
    return ok(res, serialize(profile));
});

export const recipientProfile = asyncHandler(async (req, res) => {
    const profile = await walletService.getRecipientProfile(req.user.id, req.params.identifier);
    return ok(res, serialize(profile));
});

export const categories = asyncHandler(async (req, res) => {
    return ok(res, serialize(await walletService.listCategories(req.user.id)));
});

// --- Emergency Wallet Lock (Phase 6) ---

export const lockStatus = asyncHandler(async (req, res) => {
    return ok(res, serialize(await walletService.getLockStatus(req.user.id)));
});

export const lock = asyncHandler(async (req, res) => {
    const result = await walletService.lockWallet(req.user.id, req.body, getClientInfo(req));
    return created(res, serialize(result));
});

export const unlock = asyncHandler(async (req, res) => {
    const result = await walletService.unlockWallet(req.user.id, req.body?.password, getClientInfo(req));
    return ok(res, serialize(result));
});

export default { getWallet, addMoney, withdraw, send, resolveRecipient, recipientProfile, categories, lockStatus, lock, unlock };
