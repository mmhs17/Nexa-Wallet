/**
 * NEXA Wallet — consistent API response envelope.
 * Every JSON response uses: { success, data, meta? } or { success:false, error }.
 */

export function ok(res, data = null, meta = undefined, statusCode = 200) {
    const payload = { success: true, data };
    if (meta !== undefined) payload.meta = meta;
    return res.status(statusCode).json(payload);
}

export function created(res, data = null, meta = undefined) {
    return ok(res, data, meta, 201);
}

export function paginated(res, items, { page, pageSize, total }) {
    return ok(res, items, {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
}

/**
 * Decimal-safe serialization: Prisma returns Decimal objects (or strings).
 * Convert Decimal -> number and BigInt -> string so JSON is clean.
 */
export function serialize(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === "object") {
        if (typeof value.toNumber === "function") return value.toNumber();
        if (value instanceof Date) return value.toISOString();
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
        return out;
    }
    if (typeof value === "bigint") return value.toString();
    return value;
}

export default { ok, created, paginated, serialize };