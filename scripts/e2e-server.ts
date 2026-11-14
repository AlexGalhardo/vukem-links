// Starts the compiled app for Playwright on a brand new database: migrates,
// creates the admin, loads seed.json, then serves. No network is involved.
import { mkdirSync, rmSync } from "node:fs";

const port = process.argv[2] ?? "8765";
const dir = "test-results/e2e-db";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const exe = process.platform === "win32" ? "bin/links.exe" : "bin/links";
// The frontend must be built first (bun run build): its assets are embedded in the binary.
const build = Bun.spawnSync(["go", "build", "-o", exe, "./cmd/app"], { stdout: "inherit", stderr: "inherit" });
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

const key = Bun.spawnSync([exe, "key:generate"]).stdout.toString().trim();
const env = {
  ...process.env,
  APP_ENV: "development",
  APP_KEY: key,
  HOST: "127.0.0.1",
  PORT: port,
  DATABASE_URL: `file:${dir}/e2e.sqlite`,
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "e2e-password-123",
  LINKS_API_KEY: "e2e-links-api-key-0123456789abcdef",
  LOG_LEVEL: "warn",
};

for (const args of [["migrate"], ["admin:create"], ["import:seed"]]) {
  const step = Bun.spawnSync([exe, ...args], { env, stdout: "inherit", stderr: "inherit" });
  if (step.exitCode !== 0) process.exit(step.exitCode ?? 1);
}

const server = Bun.spawn([exe, "serve"], { env, stdout: "inherit", stderr: "inherit" });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
process.exit(await server.exited);
