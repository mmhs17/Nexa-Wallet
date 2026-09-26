import * as extras from "../services/extras.service.js";
import { getClientInfo } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, created, serialize } from "../utils/response.js";

/** NEXA Wallet — notifications / beneficiaries / requests / recurring controller. */

export const listNotifications = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.listNotifications(req.user.id, req.query)));
});

export const markRead = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.markNotificationRead(req.user.id, req.params.id)));
});

export const markAllRead = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.markAllNotificationsRead(req.user.id)));
});

export const listBeneficiaries = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.listBeneficiaries(req.user.id)));
});

export const createBeneficiary = asyncHandler(async (req, res) => {
    return created(res, serialize(await extras.createBeneficiary(req.user.id, req.body)));
});

export const updateBeneficiary = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.updateBeneficiary(req.user.id, req.params.id, req.body)));
});

export const deleteBeneficiary = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.deleteBeneficiary(req.user.id, req.params.id)));
});

export const listRequests = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.listRequests(req.user.id, { box: req.query.box || "received" })));
});

export const createRequest = asyncHandler(async (req, res) => {
    return created(res, serialize(await extras.createRequest(req.user.id, req.body)));
});

export const respondRequest = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.respondRequest(req.user.id, req.params.id, req.params.action, getClientInfo(req))));
});

export const listRecurring = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.listRecurring(req.user.id)));
});

export const createRecurring = asyncHandler(async (req, res) => {
    return created(res, serialize(await extras.createRecurring(req.user.id, req.body)));
});

export const pauseRecurring = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.pauseRecurring(req.user.id, req.params.id)));
});

export const resumeRecurring = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.resumeRecurring(req.user.id, req.params.id)));
});

export const deleteRecurring = asyncHandler(async (req, res) => {
    return ok(res, serialize(await extras.deleteRecurring(req.user.id, req.params.id)));
});

export default {
    listNotifications, markRead, markAllRead,
    listBeneficiaries, createBeneficiary, updateBeneficiary, deleteBeneficiary,
    listRequests, createRequest, respondRequest,
    listRecurring, createRecurring, pauseRecurring, resumeRecurring, deleteRecurring,
};