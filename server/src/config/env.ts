import { z } from "../common/zod.js";

const bool = (def: boolean) =>
  z
    .enum(["true", "false"])
    .default(def ? "true" : "false")
    .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.url({ message: "must be an absolute URL such as https://cims.example.org" }),
  DATABASE_URL: z
    .string()
    .min(1, "is required (Neon pooled connection string)")
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "must start with postgresql://"),
  DIRECT_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  SESSION_COOKIE_NAME: z.string().min(1).default("cims.sid"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(8),
  BUSINESS_TIMEZONE: z.string().default("Asia/Kolkata").refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "must be a valid IANA time zone"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  SWAGGER_ENABLED: z.enum(["true", "false"]).optional(),
  ALLOW_ADMIN_ISSUE: bool(false),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  MAX_ITEM_QUANTITY: z.coerce.number().int().min(1).max(1_000_000).default(1000),
});

export type Env = z.output<typeof envSchema> & { swaggerEnabled: boolean; isProduction: boolean };

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n - ${problems.join("\n - ")}`);
    this.name = "EnvError";
  }
}

/** Validates an environment object. Error messages name variables only — never their values. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  const data = parsed.data;
  const isProduction = data.NODE_ENV === "production";
  const problems: string[] = [];
  if (isProduction && !data.APP_ORIGIN.startsWith("https://"))
    problems.push("APP_ORIGIN: must be https in production");
  if (isProduction && /change|example|placeholder|generate/i.test(data.SESSION_SECRET)) {
    problems.push("SESSION_SECRET: looks like a placeholder; generate a random value");
  }
  if (problems.length) throw new EnvError(problems);
  const swaggerEnabled = data.SWAGGER_ENABLED ? data.SWAGGER_ENABLED === "true" : !isProduction;
  return { ...data, swaggerEnabled, isProduction };
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
