import { ApiError } from "./api-client";

/** Plain-language messages for the backend's error codes (see docs/api-reference.md). */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "NETWORK_ERROR":
      return error.message;
    case "INVALID_CREDENTIALS":
      return "Employee code / email or password is incorrect.";
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "UNAUTHENTICATED":
      return "Your session has ended. Please sign in again.";
    case "FORBIDDEN":
      return "You do not have permission to do that.";
    case "CSRF_FAILED":
      return "Your session security token was rejected. Reload the page and try again.";
    case "NOT_FOUND":
      return "That item was not found, or you do not have access to it.";
    case "ALREADY_DECIDED":
      return "Another reviewer has already decided this request. The latest status is shown below.";
    case "SELF_APPROVAL_FORBIDDEN":
      return "You cannot approve or reject your own request. Another administrator must review it.";
    case "INVALID_STATE_TRANSITION":
      return "This request is no longer in a state where that action is allowed. The latest status is shown.";
    case "INSUFFICIENT_STOCK":
      return "There is not enough available stock to issue this quantity. Nothing was deducted.";
    case "OVER_ISSUE":
      return "You tried to issue more than the approved quantity still remaining. Nothing was deducted.";
    case "IDEMPOTENCY_CONFLICT":
      return "This submission conflicts with an earlier one that used different quantities. Review and submit again.";
    case "DUPLICATE_RESOURCE":
      return "That record already exists.";
    case "VALIDATION_ERROR":
      return error.fieldErrors?.[0]
        ? `${error.message} ${error.fieldErrors[0].path}: ${error.fieldErrors[0].message}`
        : error.message;
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

/** Errors that mean "the screen data is stale": refresh it after showing the message. */
export const isStaleStateError = (error: unknown): boolean =>
  error instanceof ApiError &&
  ["ALREADY_DECIDED", "INVALID_STATE_TRANSITION", "INSUFFICIENT_STOCK", "OVER_ISSUE", "NOT_FOUND"].includes(
    error.code,
  );
