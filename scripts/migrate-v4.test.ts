// Runs the real one-off migration script against v4-shaped tables in the throwaway test database.
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const HOST = "https://app.v4shop.example.com";
const OTHER = "https://www.v4other.example.com";

const FIXTURE = [
	"create table master_categories (id text primary key, name text, slug text)",
	"create table categories (id text primary key, name text, slug text, master_category_id text)",
	"create table subcategories (id text primary key, external_id text, name text, slug text, category_id text, bitly_url text)",
	"create table links (id text primary key, url text, subcategory_id text, clicks integer, created_at integer)",
	"insert into categories values ('c1', 'Fones', 'fones', 'm1')",
	`insert into subcategories values
		('s1', '${HOST}/fones/x1', 'Fone X1', 'x1', 'c1', 'https://bit.ly/x1'),
		('s2', '${OTHER}/p/y', 'Produto Y', 'y', null, null),
		('s3', 'not-a-url', 'Sem URL', 'z', 'c1', null),
		('s4', '${HOST}/fones/x4', 'Fone X4', 'x4', 'c1', null)`,
	`insert into links values
		('l2', 'https://amzn.to/v4-second', 's1', 7, 2),
		('l1', 'https://mercadolivre.com/sec/v4-first', 's1', 42, 1),
		('l3', 'https://s.shopee.com.br/v4-y', 's2', 3, 3),
		('l4', 'https://amzn.to/v4-skipped', 's3', 1, 4),
		('l5', 'javascript:alert(1)', 's4', 9, 5)`,
];

interface Row {
	project: string;
	baseUrl: string;
	name: string;
	category: string | null;
	pageUrl: string;
	store: string;
	priority: number;
	legacyClicks: number;
}

async function migrated(): Promise<Row[]> {
	return (await db.all(sql`
		select p.slug as project, p.base_url as baseUrl, pr.name as name, pr.category as category, pr.page_url as pageUrl,
			l.store as store, l.priority as priority, l.legacy_clicks as legacyClicks
		from affiliate_links l
		join products pr on pr.id = l.product_id
		join projects p on p.id = pr.project_id
		where l.url like '%v4-%'
		order by pr.name, l.priority`)) as Row[];
}

test("migrate-v4 copies v4 rows, keeps click counters, is idempotent and never touches v4 tables", async () => {
	for (const statement of FIXTURE) await db.run(sql.raw(statement));

	await import("@/scripts/migrate-v4");
	const rows = await migrated();
	expect(rows).toEqual([
		// Priority follows v4 creation order (created_at), not insertion order.
		{
			project: "v4shop",
			baseUrl: HOST,
			name: "Fone X1",
			category: "fones",
			pageUrl: `${HOST}/fones/x1`,
			store: "mercadolivre",
			priority: 0,
			legacyClicks: 42,
		},
		{
			project: "v4shop",
			baseUrl: HOST,
			name: "Fone X1",
			category: "fones",
			pageUrl: `${HOST}/fones/x1`,
			store: "amazon",
			priority: 1,
			legacyClicks: 7,
		},
		{
			project: "v4other",
			baseUrl: OTHER,
			name: "Produto Y",
			category: null,
			pageUrl: `${OTHER}/p/y`,
			store: "shopee",
			priority: 0,
			legacyClicks: 3,
		},
	]);

	// Second run: nothing duplicated, counters reapplied.
	await db.run(sql`update links set clicks = 50 where id = 'l1'`);
	// A query string gives the module a new cache key, so the script body runs a second time.
	const rerun = "@/scripts/migrate-v4?rerun";
	await import(rerun);
	const again = await migrated();
	expect(again).toHaveLength(3);
	expect(again[0]?.legacyClicks).toBe(50);

	const [v4] = (await db.all(sql`select count(*) as n from links`)) as { n: number }[];
	expect(v4?.n).toBe(5);
	const [subs] = (await db.all(sql`select count(*) as n from subcategories`)) as { n: number }[];
	expect(subs?.n).toBe(4);
});
