import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	// Single-admin app: accounts are created only by scripts/seed.ts.
	emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
	// Database storage because in-memory counters reset on every serverless cold start.
	rateLimit: { enabled: true, storage: "database" },
	plugins: [nextCookies()],
});
