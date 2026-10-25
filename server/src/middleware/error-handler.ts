import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, type ErrorCode, type FieldError } from "../common/errors.js";
import type { Logger } from "./logger.js";

interface ErrorBody {
  error: { code: ErrorCode; message: string; fieldErrors?: FieldError[]; requestId: string };
}

export const zodFieldErrors = (err: ZodError, prefix = ""): FieldError[] =>
  err.issues.map((i) => ({
    path: [prefix, ...i.path].filter((p) => p !== "").join("."),
    message: i.message,
  }));

/** Prisma errors are detected structurally so this file has no hard dependency on the generated client. */
function prismaCode(err: unknown): { code: string; meta?: { target?: unknown } } | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string" && /^P\d{4}$/.test(code))
      return { code, meta: (err as { meta?: { target?: unknown } }).meta };
  }
  return undefined;
}

export function toAppError(err: unknown): AppError | undefined {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError)
    return new AppError(400, "VALIDATION_ERROR", "Request validation failed.", zodFieldErrors(err));
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.too.large") {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
    return new AppError(400, "VALIDATION_ERROR", "Request body is not valid JSON.");
  }
  const p = prismaCode(err);
  if (p) {
    const target = JSON.stringify(p.meta?.target ?? "");
    if (p.code === "P2002") {
      return /idempotency/i.test(target)
        ? new AppError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This operation was already submitted; retry to receive the original result.",
          )
        : new AppError(409, "DUPLICATE_RESOURCE", "A record with the same unique value already exists.");
    }
    if (p.code === "P2025") return new AppError(404, "NOT_FOUND", "Resource not found.");
    if (p.code === "P2003")
      return new AppError(409, "CONFLICT", "The operation conflicts with related records.");
    if (p.code === "P2034")
      return new AppError(
        409,
        "CONFLICT",
        "The operation conflicted with a concurrent change; please retry.",
      );
  }
  return undefined;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found.", requestId: String(req.id) },
  } satisfies ErrorBody);
};

export const errorHandler =
  (logger: Logger, isProduction: boolean): ErrorRequestHandler =>
  (err, req, res, _next) => {
    const known = toAppError(err);
    if (known) {
      if (known.status >= 500) logger.error({ err, requestId: String(req.id) }, "request failed");
      res.status(known.status).json({
        error: {
          code: known.code,
          message: known.message,
          ...(known.fieldErrors?.length ? { fieldErrors: known.fieldErrors } : {}),
          requestId: String(req.id),
        },
      } satisfies ErrorBody);
      return;
    }
    logger.error({ err, requestId: String(req.id) }, "unhandled error");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: isProduction
          ? "An unexpected error occurred."
          : `An unexpected error occurred: ${err instanceof Error ? err.message : "unknown"}`,
        requestId: String(req.id),
      },
    } satisfies ErrorBody);
  };
