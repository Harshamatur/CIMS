import { ApiRouter } from "../../common/api-router.js";
import { getEnv } from "../../config/env.js";
import { issueRoles, rolesFor } from "../../common/permissions.js";
import { idParams, idempotencyKeyHeader, optionalIdempotencyKeyHeader } from "../../common/schemas.js";
import { z } from "../../common/zod.js";
import { requestDetailSchema } from "../requests/requests.schemas.js";
import { recordIssue } from "./issue.service.js";
import {
  adjustmentBody,
  issueBody,
  listTransactionsQuery,
  receiptBody,
  reversalBody,
  transactionListResponse,
  transactionResponse,
} from "./stock.schemas.js";
import { listTransactions, recordAdjustment, recordReceipt, reverseTransaction } from "./stock.service.js";

export function registerStockRoutes(api: ApiRouter): void {
  api.route({
    method: "get",
    path: "/stock-transactions",
    summary: "Stock ledger (append-only)",
    description: "`quantity` is always positive; `direction` says whether on-hand stock went IN or OUT.",
    tags: ["Stock"],
    access: rolesFor("stock:read"),
    query: listTransactionsQuery,
    response: transactionListResponse,
    handler: async ({ query }) => listTransactions(query),
  });

  api.route({
    method: "post",
    path: "/stock-transactions/receipts",
    summary: "Record a stock receipt",
    description:
      "Optional `Idempotency-Key` makes retries safe: a repeat returns the original transaction without adding stock twice.",
    tags: ["Stock"],
    access: rolesFor("stock:receipt"),
    body: receiptBody,
    headers: optionalIdempotencyKeyHeader,
    response: transactionResponse,
    successStatus: 201,
    errorStatuses: [404, 409],
    handler: async ({ body, headers, ctx, res }) => {
      const out = await recordReceipt(ctx, body, headers["idempotency-key"]);
      if (out.replayed) res.setHeader("Idempotent-Replay", "true");
      return { data: out.transaction };
    },
  });

  api.route({
    method: "post",
    path: "/stock-transactions/adjustments",
    summary: "Record a justified stock adjustment",
    description:
      "ADMIN only. A reason of at least 10 characters is required. Adjusting OUT never drives available stock below zero.",
    tags: ["Stock"],
    access: rolesFor("stock:adjust"),
    body: adjustmentBody,
    headers: optionalIdempotencyKeyHeader,
    response: transactionResponse,
    successStatus: 201,
    errorStatuses: [404, 409],
    handler: async ({ body, headers, ctx, res }) => {
      const out = await recordAdjustment(ctx, body, headers["idempotency-key"]);
      if (out.replayed) res.setHeader("Idempotent-Replay", "true");
      return { data: out.transaction };
    },
  });

  api.route({
    method: "post",
    path: "/stock-transactions/:id/reverse",
    summary: "Reverse a receipt or adjustment with a traceable REVERSAL transaction",
    description: "History is never edited. Issues cannot be reversed in this prototype.",
    tags: ["Stock"],
    access: rolesFor("stock:reverse"),
    params: idParams,
    body: reversalBody,
    response: transactionResponse,
    successStatus: 201,
    errorStatuses: [409, 422],
    handler: async ({ params, body, ctx }) => ({
      data: await reverseTransaction(ctx, params.id, body.reason),
    }),
  });

  api.route({
    method: "post",
    path: "/requests/:id/issue",
    summary: "Record the physical issue of approved chemicals",
    description:
      "Separate from approval. Deducts stock atomically and records ISSUE transactions. Requires the `Idempotency-Key` header: repeating the same call returns the original result (header `Idempotent-Replay: true`) and never deducts twice. Partial issue is supported; the request becomes PARTIALLY_ISSUED until every approved quantity is issued. By default only STOREKEEPER may issue (ALLOW_ADMIN_ISSUE=true also permits ADMIN).",
    tags: ["Stock"],
    access: issueRoles(getEnv().ALLOW_ADMIN_ISSUE),
    params: idParams,
    body: issueBody,
    headers: idempotencyKeyHeader,
    response: z.object({ data: requestDetailSchema }),
    errorStatuses: [409, 422],
    handler: async ({ params, body, headers, user, ctx, res }) => {
      const out = await recordIssue(ctx, user, params.id, body.lines, headers["idempotency-key"], body.note);
      if (out.replayed) res.setHeader("Idempotent-Replay", "true");
      return { data: out.request };
    },
  });
}
