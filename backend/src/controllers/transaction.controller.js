import * as transactionService from "../services/transaction.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, paginated, serialize } from "../utils/response.js";

/** NEXA Wallet — transaction ledger controller (thin HTTP layer). */

export const list = asyncHandler(async (req, res) => {
    const result = await transactionService.listTransactions(req.user.id, req.query);
    const { items, page, pageSize, total } = result;
    return paginated(res, serialize(items), { page, pageSize, total });
});

export const detail = asyncHandler(async (req, res) => {
    const txn = await transactionService.getTransaction(req.user.id, req.params.id);
    return ok(res, serialize(txn));
});

export const receipt = asyncHandler(async (req, res) => {
    const receiptData = await transactionService.getReceipt(req.user.id, req.params.id);
    return ok(res, serialize(receiptData));
});

export const exportCsv = asyncHandler(async (req, res) => {
    const { csv, count } = await transactionService.exportTransactionsCsv(req.user.id, req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="nexa-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("X-Export-Count", String(count));
    return res.status(200).send(csv);
});

export default { list, detail, receipt, exportCsv };
