/**
 * Guards automated tests against touching a real operational database.
 * Throws unless the URL points at a dedicated database whose name ends in `_test`.
 */
export function assertSafeTestDatabase(
  testUrl: string | undefined,
  env: Record<string, string | undefined> = process.env,
): URL {
  if (!testUrl) throw new Error("TEST_DATABASE_URL is required to run database tests.");
  let url: URL;
  try {
    url = new URL(testUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL.");
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/_test$/.test(dbName)) {
    throw new Error("Refusing to run tests: the test database name must end with '_test'.");
  }
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const other = env[key];
    if (other && other === testUrl)
      throw new Error(`Refusing to run tests: TEST_DATABASE_URL equals ${key}.`);
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (!local && env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(
      "Refusing to run tests against a remote host unless ALLOW_REMOTE_TEST_DB=true is set explicitly.",
    );
  }
  return url;
}
