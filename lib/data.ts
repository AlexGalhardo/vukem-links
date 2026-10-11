import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import {
	type AffiliateLink,
	affiliateLinks,
	clickEvents,
	type LinkCheck,
	linkChecks,
	type Product,
	type Project,
	products,
	projects,
} from "@/db/schema";
import { db } from "@/lib/db";
import { detectStore, nameFromExternalId, type ProductInput, type ProjectClicks, sameHost } from "@/lib/links";

const DAY = 86_400_000;
const humanClick = eq(clickEvents.isBot, false);

/** The project of a site, created on its first contact: name and slug come from the host. */
export async function findOrCreateProject(baseUrl: string): Promise<Project> {
	const [existing] = await db.select().from(projects).where(eq(projects.baseUrl, baseUrl));
	if (existing) return existing;
	const host = new URL(baseUrl).hostname.replace(/^www\./, "");
	const base =
		host
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 34) || "site";
	const taken = new Set((await db.select({ slug: projects.slug }).from(projects)).map((project) => project.slug));
	let slug = base;
	for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
	const [created] = await db.insert(projects).values({ name: host, slug, baseUrl }).returning();
	if (!created) throw new Error(`Could not create the project of ${baseUrl}`);
	return created;
}

export interface UpsertSummary {
	productsCreated: number;
	linksAdded: number;
	errors: string[];
}

function chunks<T>(items: T[], size = 100): T[][] {
	return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/**
 * Single write path for the form, the JSON/CSV import and POST /api/v1/links.
 * Existing products are matched by externalId; links are appended (lowest priority), never replaced.
 */
export async function upsertProducts(project: Project, inputs: ProductInput[]): Promise<UpsertSummary> {
	const summary: UpsertSummary = { productsCreated: 0, linksAdded: 0, errors: [] };
	const existingProducts = new Map(
		(await db.select().from(products)).map((p) => [p.externalId, p] as [string, Pick<Product, "id" | "projectId">]),
	);
	const existingLinks = await db
		.select({ productId: affiliateLinks.productId, url: affiliateLinks.url, priority: affiliateLinks.priority })
		.from(affiliateLinks);
	const urlsByProduct = new Map<string, Set<string>>();
	const maxPriority = new Map<string, number>();
	for (const l of existingLinks) {
		urlsByProduct.set(l.productId, (urlsByProduct.get(l.productId) ?? new Set()).add(l.url));
		maxPriority.set(l.productId, Math.max(maxPriority.get(l.productId) ?? -1, l.priority));
	}

	const newProducts: (typeof products.$inferInsert)[] = [];
	const newLinks: (typeof affiliateLinks.$inferInsert)[] = [];
	for (const input of inputs) {
		let product = existingProducts.get(input.externalId);
		if (product && product.projectId !== project.id) {
			summary.errors.push(`${input.externalId}: pertence a outro projeto`);
			continue;
		}
		if (!product) {
			const pageUrl = input.pageUrl ?? (URL.canParse(input.externalId) ? input.externalId : project.baseUrl);
			// The redirect falls back to pageUrl, so it must stay inside the project (open-redirect guard).
			if (!sameHost(pageUrl, project.baseUrl)) {
				summary.errors.push(`${input.externalId}: pageUrl fora do domínio do projeto`);
				continue;
			}
			product = { id: crypto.randomUUID(), projectId: project.id };
			existingProducts.set(input.externalId, product);
			newProducts.push({
				...product,
				externalId: input.externalId,
				name: input.name ?? nameFromExternalId(input.externalId),
				pageUrl,
				category: input.category,
			});
		}
		const urls = urlsByProduct.get(product.id) ?? new Set<string>();
		urlsByProduct.set(product.id, urls);
		for (const link of input.links) {
			if (urls.has(link.url)) continue;
			urls.add(link.url);
			const priority = (maxPriority.get(product.id) ?? -1) + 1;
			maxPriority.set(product.id, priority);
			newLinks.push({
				productId: product.id,
				url: link.url,
				store: link.store || detectStore(link.url),
				priority,
			});
		}
	}

	for (const batch of chunks(newProducts)) await db.insert(products).values(batch);
	for (const batch of chunks(newLinks)) await db.insert(affiliateLinks).values(batch);
	summary.productsCreated = newProducts.length;
	summary.linksAdded = newLinks.length;
	return summary;
}

/** URLs each product of the project already has, keyed by externalId. */
export async function registeredUrls(projectId: string): Promise<Map<string, Set<string>>> {
	const rows = await db
		.select({ externalId: products.externalId, url: affiliateLinks.url })
		.from(affiliateLinks)
		.innerJoin(products, eq(products.id, affiliateLinks.productId))
		.where(eq(products.projectId, projectId));
	const byProduct = new Map<string, Set<string>>();
	for (const row of rows) byProduct.set(row.externalId, (byProduct.get(row.externalId) ?? new Set()).add(row.url));
	return byProduct;
}

export interface SyncSummary extends UpsertSummary {
	productsUpdated: number;
	productsRemoved: number;
	linksRemoved: number;
}

/**
 * Declarative counterpart of upsertProducts for PUT /api/v1/links: afterwards the project holds exactly `inputs`.
 * Creation still goes through upsertProducts; this reconciles what already existed (fields, link set, order) and
 * removes what the project no longer publishes. Removing a product drops its click history (cascade).
 */
export async function syncProducts(project: Project, inputs: ProductInput[]): Promise<SyncSummary> {
	const summary: SyncSummary = {
		...(await upsertProducts(project, inputs)),
		productsUpdated: 0,
		productsRemoved: 0,
		linksRemoved: 0,
	};
	const wanted = new Map(inputs.map((input) => [input.externalId, input]));
	const own = await db.select().from(products).where(eq(products.projectId, project.id));

	const stale = own.filter((p) => !wanted.has(p.externalId)).map((p) => p.id);
	for (const batch of chunks(stale)) await db.delete(products).where(inArray(products.id, batch));
	summary.productsRemoved = stale.length;

	const kept = own.filter((p) => wanted.has(p.externalId));
	const linksByProduct = new Map<string, AffiliateLink[]>();
	for (const batch of chunks(kept.map((p) => p.id)))
		for (const link of await db.select().from(affiliateLinks).where(inArray(affiliateLinks.productId, batch)))
			linksByProduct.set(link.productId, [...(linksByProduct.get(link.productId) ?? []), link]);

	const staleLinks: string[] = [];
	for (const product of kept) {
		const input = wanted.get(product.externalId);
		if (!input) continue;
		const patch: Partial<typeof products.$inferInsert> = {};
		if (input.name && input.name !== product.name) patch.name = input.name;
		if (input.category !== undefined && input.category !== product.category) patch.category = input.category;
		if (input.pageUrl && input.pageUrl !== product.pageUrl) {
			if (sameHost(input.pageUrl, project.baseUrl)) patch.pageUrl = input.pageUrl;
			else summary.errors.push(`${input.externalId}: pageUrl fora do domínio do projeto`);
		}
		if (Object.keys(patch).length) {
			await db.update(products).set(patch).where(eq(products.id, product.id));
			summary.productsUpdated++;
		}

		const order = new Map(input.links.map((link, index) => [link.url, { index, store: link.store }]));
		for (const link of linksByProduct.get(product.id) ?? []) {
			const target = order.get(link.url);
			if (!target) {
				staleLinks.push(link.id);
				continue;
			}
			const store = target.store || link.store;
			if (link.priority !== target.index || link.store !== store)
				await db
					.update(affiliateLinks)
					.set({ priority: target.index, store })
					.where(eq(affiliateLinks.id, link.id));
		}
	}
	for (const batch of chunks(staleLinks)) await db.delete(affiliateLinks).where(inArray(affiliateLinks.id, batch));
	summary.linksRemoved = staleLinks.length;
	return summary;
}

/** Human clicks that reached a store in the last `days` days, for every project (including the ones with none). */
export async function getClicksByProject(days: number): Promise<ProjectClicks[]> {
	const since = new Date(Date.now() - days * DAY);
	const counted = await db
		.select({ projectId: products.projectId, clicks: sql<number>`count(*)` })
		.from(clickEvents)
		.innerJoin(products, eq(products.id, clickEvents.productId))
		.where(and(humanClick, isNotNull(clickEvents.linkId), gte(clickEvents.createdAt, since)))
		.groupBy(products.projectId);
	const byProject = new Map(counted.map((row) => [row.projectId, row.clicks]));
	return (await db.select({ id: projects.id, name: projects.name }).from(projects)).map((project) => ({
		name: project.name,
		clicks: byProject.get(project.id) ?? 0,
	}));
}

export interface LinkRow {
	id: string;
	url: string;
	store: string;
	status: AffiliateLink["status"];
	priority: number;
	lastCheckedAt: number | null;
	lastStatusCode: number | null;
	productId: string;
	productName: string;
	externalId: string;
	pageUrl: string;
	category: string | null;
	projectSlug: string;
	projectName: string;
	clicks: number;
	mobile: number;
}

/** ponytail: returns every link and the table filters in memory; paginate server-side past ~5k links. */
export async function listLinks(): Promise<LinkRow[]> {
	const counts = db
		.select({
			linkId: clickEvents.linkId,
			clicks: sql<number>`count(*)`.as("clicks"),
			mobile: sql<number>`sum(${clickEvents.device} <> 'desktop')`.as("mobile"),
		})
		.from(clickEvents)
		.where(humanClick)
		.groupBy(clickEvents.linkId)
		.as("counts");
	const rows = await db
		.select({
			id: affiliateLinks.id,
			url: affiliateLinks.url,
			store: affiliateLinks.store,
			status: affiliateLinks.status,
			priority: affiliateLinks.priority,
			lastCheckedAt: affiliateLinks.lastCheckedAt,
			lastStatusCode: affiliateLinks.lastStatusCode,
			legacyClicks: affiliateLinks.legacyClicks,
			productId: products.id,
			productName: products.name,
			externalId: products.externalId,
			pageUrl: products.pageUrl,
			category: products.category,
			projectSlug: projects.slug,
			projectName: projects.name,
			clicks: counts.clicks,
			mobile: counts.mobile,
		})
		.from(affiliateLinks)
		.innerJoin(products, eq(products.id, affiliateLinks.productId))
		.innerJoin(projects, eq(projects.id, products.projectId))
		.leftJoin(counts, eq(counts.linkId, affiliateLinks.id))
		.orderBy(products.name, affiliateLinks.priority);
	return rows.map(({ legacyClicks, lastCheckedAt, ...r }) => ({
		...r,
		lastCheckedAt: lastCheckedAt?.getTime() ?? null,
		clicks: (r.clicks ?? 0) + legacyClicks,
		mobile: r.mobile ?? 0,
	}));
}

export interface Bucket {
	key: string;
	count: number;
}

export interface Stats {
	/** Human clicks with per-click data (since v5). */
	clicks: number;
	legacyClicks: number;
	botClicks: number;
	/** Clicks that found no usable link and were sent back to the product page. */
	lostClicks: number;
	byDay: Bucket[];
	byDevice: Bucket[];
	byCountry: Bucket[];
	byReferer: Bucket[];
	byOs: Bucket[];
	byBrowser: Bucket[];
}

export interface StatsScope {
	projectId?: string;
	linkId?: string;
	days?: number;
}

export async function getStats({ projectId, linkId, days = 30 }: StatsScope = {}): Promise<Stats> {
	const scope = and(
		linkId ? eq(clickEvents.linkId, linkId) : undefined,
		projectId ? eq(products.projectId, projectId) : undefined,
	);
	const since = new Date(Date.now() - days * DAY);
	const events = () =>
		db
			.select({ key: sql<string>`''`, count: sql<number>`count(*)` })
			.from(clickEvents)
			.innerJoin(products, eq(products.id, clickEvents.productId));
	const groupBy = (column: SQLiteColumn) =>
		db
			.select({ key: sql<string>`coalesce(${column}, '—')`, count: sql<number>`count(*)` })
			.from(clickEvents)
			.innerJoin(products, eq(products.id, clickEvents.productId))
			.where(and(scope, humanClick, gte(clickEvents.createdAt, since)))
			.groupBy(column)
			.orderBy(desc(sql`count(*)`))
			.limit(8);
	const day = sql<string>`date(${clickEvents.createdAt} / 1000, 'unixepoch')`;

	const [[total], [bots], [lost], [legacy], perDay, byDevice, byCountry, byReferer, byOs, byBrowser] =
		await Promise.all([
			events().where(and(scope, humanClick)),
			events().where(and(scope, eq(clickEvents.isBot, true))),
			events().where(and(scope, humanClick, sql`${clickEvents.linkId} is null`)),
			db
				.select({ count: sql<number>`coalesce(sum(${affiliateLinks.legacyClicks}), 0)` })
				.from(affiliateLinks)
				.innerJoin(products, eq(products.id, affiliateLinks.productId))
				.where(
					and(
						linkId ? eq(affiliateLinks.id, linkId) : undefined,
						projectId ? eq(products.projectId, projectId) : undefined,
					),
				),
			db
				.select({ key: day, count: sql<number>`count(*)` })
				.from(clickEvents)
				.innerJoin(products, eq(products.id, clickEvents.productId))
				.where(and(scope, humanClick, gte(clickEvents.createdAt, since)))
				.groupBy(day),
			groupBy(clickEvents.device),
			groupBy(clickEvents.country),
			groupBy(clickEvents.referer),
			groupBy(clickEvents.os),
			groupBy(clickEvents.browser),
		]);

	const counts = new Map(perDay.map((d) => [d.key, d.count]));
	const byDay = Array.from({ length: days }, (_, i) => {
		const key = new Date(Date.now() - (days - 1 - i) * DAY).toISOString().slice(0, 10);
		return { key, count: counts.get(key) ?? 0 };
	});
	return {
		clicks: total?.count ?? 0,
		botClicks: bots?.count ?? 0,
		lostClicks: lost?.count ?? 0,
		legacyClicks: legacy?.count ?? 0,
		byDay,
		byDevice,
		byCountry,
		byReferer,
		byOs,
		byBrowser,
	};
}

export interface LinkDetail {
	link: AffiliateLink;
	product: Product;
	project: Project;
	siblings: AffiliateLink[];
	checks: LinkCheck[];
}

export async function getLinkDetail(id: string): Promise<LinkDetail | null> {
	const [row] = await db
		.select({ link: affiliateLinks, product: products, project: projects })
		.from(affiliateLinks)
		.innerJoin(products, eq(products.id, affiliateLinks.productId))
		.innerJoin(projects, eq(projects.id, products.projectId))
		.where(eq(affiliateLinks.id, id));
	if (!row) return null;
	const [siblings, checks] = await Promise.all([
		db
			.select()
			.from(affiliateLinks)
			.where(eq(affiliateLinks.productId, row.product.id))
			.orderBy(affiliateLinks.priority),
		db.select().from(linkChecks).where(eq(linkChecks.linkId, id)).orderBy(desc(linkChecks.checkedAt)).limit(30),
	]);
	return { ...row, siblings, checks };
}
