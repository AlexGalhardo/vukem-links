import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(now).notNull();

export const projects = sqliteTable("projects", {
	id: id(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	baseUrl: text("base_url").notNull(),
	apiTokenHash: text("api_token_hash"),
	createdAt: createdAt(),
});

export const products = sqliteTable(
	"products",
	{
		id: id(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		// Public identifier used by /link?id=<externalId>. Legacy rows hold the product page URL here.
		externalId: text("external_id").notNull().unique(),
		name: text("name").notNull(),
		pageUrl: text("page_url").notNull(),
		category: text("category"),
		createdAt: createdAt(),
	},
	(t) => [index("products_project_idx").on(t.projectId)],
);

export const LINK_STATUSES = ["alive", "dead", "unknown"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

// Named affiliate_links (not links) so it can coexist with the v4 `links` table during migration.
export const affiliateLinks = sqliteTable(
	"affiliate_links",
	{
		id: id(),
		productId: text("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		store: text("store").notNull(),
		url: text("url").notNull(),
		priority: integer("priority").notNull().default(0),
		status: text("status", { enum: LINK_STATUSES }).notNull().default("unknown"),
		consecutiveFailures: integer("consecutive_failures").notNull().default(0),
		lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
		lastStatusCode: integer("last_status_code"),
		finalUrl: text("final_url"),
		// Clicks counted by v4, before per-click events existed (no device/date available).
		legacyClicks: integer("legacy_clicks").notNull().default(0),
		createdAt: createdAt(),
	},
	(t) => [index("affiliate_links_product_idx").on(t.productId)],
);

export const clickEvents = sqliteTable(
	"click_events",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		productId: text("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		// null = no usable link, visitor was sent back to the product page.
		linkId: text("link_id").references(() => affiliateLinks.id, { onDelete: "cascade" }),
		device: text("device").notNull(),
		os: text("os"),
		browser: text("browser"),
		country: text("country"),
		referer: text("referer"),
		isBot: integer("is_bot", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
	},
	(t) => [index("click_events_link_idx").on(t.linkId), index("click_events_created_idx").on(t.createdAt)],
);

export const linkChecks = sqliteTable(
	"link_checks",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		linkId: text("link_id")
			.notNull()
			.references(() => affiliateLinks.id, { onDelete: "cascade" }),
		statusCode: integer("status_code"),
		finalUrl: text("final_url"),
		result: text("result").notNull(),
		checkedAt: integer("checked_at", { mode: "timestamp_ms" }).default(now).notNull(),
	},
	(t) => [index("link_checks_link_idx").on(t.linkId)],
);

// --- Better Auth tables (shape dictated by better-auth, see docs/auth.md) ---

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(now)
		.$onUpdate(() => new Date())
		.notNull(),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(t) => [index("session_userId_idx").on(t.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
		scope: text("scope"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(now)
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = sqliteTable("rate_limit", {
	id: text("id").primaryKey(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: integer("last_request").notNull(),
});

export type Project = typeof projects.$inferSelect;
export type Product = typeof products.$inferSelect;
export type AffiliateLink = typeof affiliateLinks.$inferSelect;
export type ClickEvent = typeof clickEvents.$inferSelect;
export type LinkCheck = typeof linkChecks.$inferSelect;
