// Integration tests: real queries against the throwaway SQLite file created by test/setup.ts.
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { affiliateLinks, clickEvents, linkChecks, products, projects } from "@/db/schema";
import { getLinkDetail, getStats, hashToken, listLinks, rotateApiToken, upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { createProject } from "@/test/helpers";

const ML = "https://mercadolivre.com/sec/abc";
const AMZ = "https://amzn.to/abc";

async function linksOf(slug: string) {
	return (await listLinks()).filter((l) => l.projectSlug === slug);
}

describe("upsertProducts", () => {
	test("creates the product with derived name, page and store, links in typed order", async () => {
		const project = await createProject();
		const externalId = `${project.baseUrl}/fones/modelo-x`;
		const summary = await upsertProducts(project, [{ externalId, links: [{ url: ML }, { url: AMZ }] }]);
		expect(summary).toEqual({ productsCreated: 1, linksAdded: 2, errors: [] });

		const links = await linksOf(project.slug);
		expect(links.map((l) => [l.url, l.store, l.priority, l.status])).toEqual([
			[ML, "mercadolivre", 0, "unknown"],
			[AMZ, "amazon", 1, "unknown"],
		]);
		expect(links[0]).toMatchObject({ productName: "modelo x", pageUrl: externalId, externalId });
	});

	test("is idempotent and appends new links after the existing ones", async () => {
		const project = await createProject();
		const externalId = `${project.baseUrl}/p`;
		await upsertProducts(project, [{ externalId, links: [{ url: ML }] }]);
		expect(await upsertProducts(project, [{ externalId, links: [{ url: ML }] }])).toEqual({
			productsCreated: 0,
			linksAdded: 0,
			errors: [],
		});
		const summary = await upsertProducts(project, [{ externalId, links: [{ url: ML }, { url: AMZ }] }]);
		expect(summary.linksAdded).toBe(1);
		expect((await linksOf(project.slug)).map((l) => [l.url, l.priority])).toEqual([
			[ML, 0],
			[AMZ, 1],
		]);
	});

	test("deduplicates a product repeated inside one batch", async () => {
		const project = await createProject();
		const externalId = `${project.baseUrl}/dup`;
		const summary = await upsertProducts(project, [
			{ externalId, links: [{ url: ML }] },
			{ externalId, links: [{ url: ML }, { url: AMZ }] },
		]);
		expect(summary).toEqual({ productsCreated: 1, linksAdded: 2, errors: [] });
	});

	test("refuses a product that belongs to another project", async () => {
		const [owner, other] = [await createProject(), await createProject()];
		const externalId = `${owner.baseUrl}/p`;
		await upsertProducts(owner, [{ externalId, links: [{ url: ML }] }]);
		const summary = await upsertProducts(other, [{ externalId, links: [{ url: AMZ }] }]);
		expect(summary.linksAdded).toBe(0);
		expect(summary.errors).toEqual([`${externalId}: pertence a outro projeto`]);
		expect(await linksOf(other.slug)).toHaveLength(0);
	});

	test("refuses a product page outside the project domain (open redirect)", async () => {
		const project = await createProject();
		const summary = await upsertProducts(project, [
			{ externalId: "sku-1", pageUrl: "https://evil.example.org/x", links: [{ url: ML }] },
			{ externalId: "https://evil.example.org/y", links: [{ url: ML }] },
		]);
		expect(summary.productsCreated).toBe(0);
		expect(summary.errors).toHaveLength(2);
		expect(await linksOf(project.slug)).toHaveLength(0);
	});

	test("non-URL externalId falls back to the project base URL as page", async () => {
		const project = await createProject();
		await upsertProducts(project, [{ externalId: `sku-${project.slug}`, links: [{ url: ML }] }]);
		expect((await linksOf(project.slug))[0]?.pageUrl).toBe(project.baseUrl);
	});

	test("inserts more rows than one batch holds", async () => {
		const project = await createProject();
		const inputs = Array.from({ length: 250 }, (_, i) => ({
			externalId: `${project.baseUrl}/bulk/${i}`,
			links: [{ url: `https://amzn.to/bulk-${project.slug}-${i}` }],
		}));
		expect(await upsertProducts(project, inputs)).toEqual({ productsCreated: 250, linksAdded: 250, errors: [] });
		expect(await linksOf(project.slug)).toHaveLength(250);
	});
});

async function seedClicks() {
	const project = await createProject();
	await upsertProducts(project, [{ externalId: `${project.baseUrl}/a`, links: [{ url: ML }, { url: AMZ }] }]);
	const [first, second] = await linksOf(project.slug);
	if (!first || !second) throw new Error("links not created");
	await db.update(affiliateLinks).set({ legacyClicks: 100 }).where(eq(affiliateLinks.id, first.id));
	const base = { productId: first.productId, linkId: first.id };
	await db.insert(clickEvents).values([
		{ ...base, device: "mobile", os: "iOS", browser: "Safari", country: "BR", referer: `${project.baseUrl}/a` },
		{ ...base, device: "mobile", os: "Android", browser: "Chrome", country: "BR" },
		{ ...base, device: "tablet", os: "iOS", browser: "Safari", country: "PT" },
		{ ...base, device: "desktop", os: "Windows", browser: "Chrome", country: "BR" },
		{ ...base, device: "desktop", isBot: true },
		{ ...base, linkId: second.id, device: "desktop", country: "US" },
		{ ...base, linkId: null, device: "mobile" },
		// Older than the 30-day window: counts in totals, not in the breakdowns.
		{ ...base, device: "desktop", createdAt: new Date(Date.now() - 40 * 86_400_000) },
	]);
	return { project, first, second };
}

describe("listLinks", () => {
	test("counts human clicks per link, adds legacy clicks, excludes bots and lost clicks", async () => {
		const { project } = await seedClicks();
		const [first, second] = await linksOf(project.slug);
		expect(first).toMatchObject({ clicks: 105, mobile: 3 });
		expect(second).toMatchObject({ clicks: 1, mobile: 0 });
	});
});

describe("getStats", () => {
	test("scoped to a project", async () => {
		const { project } = await seedClicks();
		const stats = await getStats({ projectId: project.id });
		expect(stats).toMatchObject({ clicks: 7, botClicks: 1, lostClicks: 1, legacyClicks: 100 });
		expect(stats.byDay).toHaveLength(30);
		expect(stats.byDay.at(-1)).toEqual({ key: new Date().toISOString().slice(0, 10), count: 6 });
		expect(stats.byDay.reduce((sum, d) => sum + d.count, 0)).toBe(6);
		expect(stats.byDevice).toEqual([
			{ key: "mobile", count: 3 },
			{ key: "desktop", count: 2 },
			{ key: "tablet", count: 1 },
		]);
		expect(stats.byCountry[0]).toEqual({ key: "BR", count: 3 });
		expect(stats.byReferer.find((r) => r.key === `${project.baseUrl}/a`)?.count).toBe(1);
		expect(stats.byOs.find((o) => o.key === "iOS")?.count).toBe(2);
	});

	test("scoped to one link leaves out sibling and lost clicks", async () => {
		const { first, second } = await seedClicks();
		expect(await getStats({ linkId: first.id })).toMatchObject({
			clicks: 5,
			botClicks: 1,
			lostClicks: 0,
			legacyClicks: 100,
		});
		expect(await getStats({ linkId: second.id })).toMatchObject({ clicks: 1, botClicks: 0, legacyClicks: 0 });
	});

	test("one project never sees another project's clicks", async () => {
		await seedClicks();
		const empty = await createProject();
		const stats = await getStats({ projectId: empty.id });
		expect(stats).toMatchObject({ clicks: 0, botClicks: 0, lostClicks: 0, legacyClicks: 0, byDevice: [] });
	});
});

describe("getLinkDetail", () => {
	test("returns the link with product, project, siblings by priority and latest checks", async () => {
		const { project, first, second } = await seedClicks();
		await db.insert(linkChecks).values([
			{ linkId: first.id, statusCode: 404, result: "failed", checkedAt: new Date(Date.now() - 1000) },
			{ linkId: first.id, statusCode: 200, result: "ok" },
		]);
		const detail = await getLinkDetail(first.id);
		expect(detail?.project.id).toBe(project.id);
		expect(detail?.siblings.map((s) => s.id)).toEqual([first.id, second.id]);
		expect(detail?.checks.map((c) => c.result)).toEqual(["ok", "failed"]);
		expect(await getLinkDetail("does-not-exist")).toBeNull();
	});
});

describe("cascade", () => {
	test("deleting a project removes its products, links, clicks and checks", async () => {
		const { project, first } = await seedClicks();
		await db.insert(linkChecks).values({ linkId: first.id, result: "ok" });
		await db.delete(projects).where(eq(projects.id, project.id));
		expect(await db.select().from(products).where(eq(products.projectId, project.id))).toHaveLength(0);
		expect(await db.select().from(affiliateLinks).where(eq(affiliateLinks.id, first.id))).toHaveLength(0);
		expect(await db.select().from(clickEvents).where(eq(clickEvents.productId, first.productId))).toHaveLength(0);
		expect(await db.select().from(linkChecks).where(eq(linkChecks.linkId, first.id))).toHaveLength(0);
	});
});

describe("api token", () => {
	test("stores only the hash and each rotation invalidates the previous token", async () => {
		const project = await createProject();
		const token = await rotateApiToken(project.id);
		expect(token).toMatch(/^la_[\w-]{32}$/);
		const [stored] = await db.select().from(projects).where(eq(projects.id, project.id));
		expect(stored?.apiTokenHash).toBe(hashToken(token));
		expect(stored?.apiTokenHash).not.toContain(token);
		const next = await rotateApiToken(project.id);
		const [rotated] = await db.select().from(projects).where(eq(projects.id, project.id));
		expect(rotated?.apiTokenHash).toBe(hashToken(next));
		expect(rotated?.apiTokenHash).not.toBe(hashToken(token));
	});
});
