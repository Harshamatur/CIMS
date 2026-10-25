import "dotenv/config";
import { createApp } from "./app.js";
import { EnvError, getEnv } from "./config/env.js";
import { disconnectDb } from "./db/client.js";
import { createLogger } from "./middleware/logger.js";

async function main(): Promise<void> {
  const env = getEnv(); // fails fast with variable NAMES only if configuration is invalid
  const logger = createLogger(env);
  const app = createApp(env);
  const server = app.listen(env.PORT, () =>
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "CIMS API listening"),
  );

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  if (err instanceof EnvError) {
    process.stderr.write(`${err.message}\nCopy .env.example to .env and fill in the values listed above.\n`);
  } else {
    process.stderr.write(`Failed to start: ${err instanceof Error ? err.message : "unknown error"}\n`);
  }
  process.exit(1);
});
