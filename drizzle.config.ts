import type { Config } from "drizzle-kit";

// Only used by `bun run db:generate`; migrations are applied by scripts/migrate.ts.
export default {
	schema: "./db/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
} satisfies Config;
