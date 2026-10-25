import { randomBytes } from "node:crypto";
import { assertSafeTestDatabase } from "../../src/common/db-safety.js";

// Runs before every integration/security test file. Fails closed unless TEST_DATABASE_URL is a safe test database.
assertSafeTestDatabase(process.env.TEST_DATABASE_URL);
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
delete process.env.DIRECT_URL;
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
process.env.LOG_LEVEL = "silent";
process.env.LOGIN_RATE_LIMIT_MAX = "1000";
process.env.SWAGGER_ENABLED = "false";
