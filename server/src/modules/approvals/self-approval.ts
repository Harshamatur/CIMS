import { AppError } from "../../common/errors.js";

/** Prototype policy (conservative default): nobody may decide their own request, not even an administrator. */
export const forbiddenSelfApproval = () =>
  new AppError(403, "SELF_APPROVAL_FORBIDDEN", "You cannot approve or reject your own request.");
