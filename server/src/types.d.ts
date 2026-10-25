import "express-session";
import type { Role } from "./common/permissions.js";

export interface AuthUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  role: Role;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      /** Correlation id (also returned as X-Request-Id and stored on audit rows). */
      id: string;
      user?: AuthUser;
    }
  }
}
