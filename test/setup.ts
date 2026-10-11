// Preloaded by `bun test` (bunfig.toml). Must run before anything imports lib/db.ts:
// Bun auto-loads .env, and tests must never touch local.db or a real Turso database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = join(mkdtempSync(join(tmpdir(), "links-afiliados-test-")), "test.db").replaceAll("\\", "/");
process.env.TURSO_DATABASE_URL = `file:${file}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.CRON_SECRET = "test-cron-secret";
process.env.LINKS_API_KEY = "test-api-key";
process.env.TELEGRAM_BOT_HTTP_TOKEN = "test-token";
process.env.TELEGRAM_BOT_CHANNEL_ID = "123";

const { migrate } = await import("drizzle-orm/libsql/migrator");
const { db } = await import("@/lib/db");
await migrate(db, { migrationsFolder: "./drizzle" });
