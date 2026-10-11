// One-off: copies v4 data (subcategories + links) into the v5 tables of the SAME database.
// Run after `bun run db:migrate`. Idempotent. Never drops the v4 tables: see docs/migration-v4.md.
import { and, eq, sql } from "drizzle-orm";
import { affiliateLinks, products, projects } from "@/db/schema";
import { upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { isPublicHttpUrl, type ProductInput } from "@/lib/links";

interface OldRow {
	externalId: string;
	name: string;
	category: string | null;
	url: string;
	clicks: number;
}

const rows = (await db.all(sql`
		select s.external_id as externalId, s.name as name, c.slug as category, l.url as url, l.clicks as clicks
		from links l
		join subcategories s on s.id = l.subcategory_id
		left join categories c on c.id = s.category_id
		order by l.created_at`)) as OldRow[];

const byOrigin = new Map<string, Map<string, ProductInput>>();
const skipped: string[] = [];
for (const row of rows) {
	if (!URL.canParse(row.externalId) || !isPublicHttpUrl(row.url)) {
		skipped.push(`${row.externalId} -> ${row.url}`);
		continue;
	}
	const origin = new URL(row.externalId).origin;
	const group = byOrigin.get(origin) ?? new Map<string, ProductInput>();
	byOrigin.set(origin, group);
	const product = group.get(row.externalId) ?? {
		externalId: row.externalId,
		name: row.name,
		category: row.category ?? undefined,
		links: [],
	};
	product.links.push({ url: row.url });
	group.set(row.externalId, product);
}

for (const [origin, group] of byOrigin) {
	const slug = new URL(origin).hostname.replace(/^(app|www)\./, "").split(".")[0] ?? "legacy";
	let [project] = await db.select().from(projects).where(eq(projects.baseUrl, origin));
	if (!project) [project] = await db.insert(projects).values({ name: slug, slug, baseUrl: origin }).returning();
	if (!project) throw new Error(`Could not create project for ${origin}`);
	const summary = await upsertProducts(project, [...group.values()]);
	console.log(
		`${origin}: ${summary.productsCreated} products, ${summary.linksAdded} links, ${summary.errors.length} errors`,
	);
	for (const error of summary.errors) console.log(`  - ${error}`);
}

for (const row of rows) {
	const [product] = await db
		.select({ id: products.id })
		.from(products)
		.where(eq(products.externalId, row.externalId));
	if (!product) continue;
	await db
		.update(affiliateLinks)
		.set({ legacyClicks: row.clicks })
		.where(and(eq(affiliateLinks.productId, product.id), eq(affiliateLinks.url, row.url)));
}
console.log(`Done. ${rows.length} v4 links read, ${skipped.length} skipped.`);
for (const s of skipped) console.log(`  skipped: ${s}`);
