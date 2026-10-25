export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "CSRF_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE_RESOURCE"
  | "INVALID_STATE_TRANSITION"
  | "ALREADY_DECIDED"
  | "SELF_APPROVAL_FORBIDDEN"
  | "INSUFFICIENT_STOCK"
  | "OVER_ISSUE"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export interface FieldError {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: FieldError[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, fieldErrors?: FieldError[]) =>
  new AppError(400, "VALIDATION_ERROR", message, fieldErrors);
export const unauthenticated = (message = "Authentication required.") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
export const forbidden = (message = "You do not have permission to perform this action.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);
export const unprocessable = (code: ErrorCode, message: string, fieldErrors?: FieldError[]) =>
  new AppError(422, code, message, fieldErrors);
