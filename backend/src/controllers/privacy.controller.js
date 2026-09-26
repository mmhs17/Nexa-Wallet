import * as privacyService from "../services/privacy.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, serialize } from "../utils/response.js";

/** NEXA Wallet — Privacy Shield controller (Phase 6, thin HTTP layer). */

export const get = asyncHandler(async (req, res) => {
    return ok(res, serialize(await privacyService.getPrivacy(req.user.id)));
});

export const update = asyncHandler(async (req, res) => {
    return ok(res, serialize(await privacyService.updatePrivacy(req.user.id, req.body)));
});

export default { get, update };
