// Integration tests: real database, mocked network (store responses and Telegram).
import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type AffiliateLink, affiliateLinks, linkChecks } from "@/db/schema";
import { upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { checkLinks } from "@/lib/health";
import { DEAD_AFTER_FAILURES } from "@/lib/links";
import { createProject, mockFetch } from "@/test/helpers";

let restore = (): void => {};
afterEach(() => restore());

// Returns a tuple as long as `urls`, so destructuring stays typed under noUncheckedIndexedAccess.
async function createLinks<T extends string[]>(...urls: T): Promise<{ [K in keyof T]: AffiliateLink }> {
	const project = await createProject();
	await upsertProducts(project, [
		{ externalId: `${project.baseUrl}/p`, name: "Fone X", links: urls.map((url) => ({ url })) },
	]);
	const rows = await db.select().from(affiliateLinks);
	return urls.map((url) => {
		const row = rows.find((r) => r.url === url);
		if (!row) throw new Error(`link ${url} not created`);
		return row;
	}) as { [K in keyof T]: AffiliateLink };
}

async function reload(id: string) {
	const [row] = await db.select().from(affiliateLinks).where(eq(affiliateLinks.id, id));
	if (!row) throw new Error("link vanished");
	return row;
}

const unique = (path: string): string => `https://store-${crypto.randomUUID().slice(0, 8)}.example.com/${path}`;

describe("checkLinks", () => {
	test("a 200 on a product page marks the link alive and records the check", async () => {
		const [link] = await createLinks(unique("p/1"));
		const net = mockFetch((url) => ({ status: 200, finalUrl: `${url}?landed=1` }));
		restore = net.restore;

		expect(await checkLinks([link.id])).toEqual({ checked: 1, ok: 1, failed: 0, inconclusive: 0, died: 0 });
		const after = await reload(link.id);
		expect(after).toMatchObject({ status: "alive", consecutiveFailures: 0, lastStatusCode: 200 });
		expect(after.finalUrl).toBe(`${link.url}?landed=1`);
		expect(after.lastCheckedAt).toBeInstanceOf(Date);
		const checks = await db.select().from(linkChecks).where(eq(linkChecks.linkId, link.id));
		expect(checks).toHaveLength(1);
		expect(checks[0]).toMatchObject({ result: "ok", statusCode: 200 });
		expect(net.telegram).toHaveLength(0);
	});

	test(`dies on the ${DEAD_AFTER_FAILURES}rd consecutive 404 and alerts Telegram exactly once`, async () => {
		const [link] = await createLinks(unique("gone"));
		const net = mockFetch(() => ({ status: 404 }));
		restore = net.restore;

		for (let attempt = 1; attempt < DEAD_AFTER_FAILURES; attempt++) {
			expect((await checkLinks([link.id])).died).toBe(0);
			expect(await reload(link.id)).toMatchObject({ status: "unknown", consecutiveFailures: attempt });
		}
		expect(net.telegram).toHaveLength(0);

		expect(await checkLinks([link.id])).toMatchObject({ failed: 1, died: 1 });
		expect(await reload(link.id)).toMatchObject({ status: "dead", consecutiveFailures: DEAD_AFTER_FAILURES });
		expect(net.telegram).toHaveLength(1);
		expect(net.telegram[0]?.text).toContain(link.url);
		expect(net.telegram[0]?.text).toContain("Fone X");

		// Already dead: still failing, but no second alert.
		expect((await checkLinks([link.id])).died).toBe(0);
		expect(net.telegram).toHaveLength(1);
		expect(await db.select().from(linkChecks).where(eq(linkChecks.linkId, link.id))).toHaveLength(
			DEAD_AFTER_FAILURES + 1,
		);
	});

	test("a dead link that answers again comes back alive", async () => {
		const [link] = await createLinks(unique("back"));
		await db
			.update(affiliateLinks)
			.set({ status: "dead", consecutiveFailures: 5 })
			.where(eq(affiliateLinks.id, link.id));
		restore = mockFetch(() => ({ status: 200 })).restore;
		await checkLinks([link.id]);
		expect(await reload(link.id)).toMatchObject({ status: "alive", consecutiveFailures: 0 });
	});

	test("bot blocks (403/429) are inconclusive and leave the health untouched", async () => {
		const [link] = await createLinks(unique("blocked"));
		await db
			.update(affiliateLinks)
			.set({ status: "alive", consecutiveFailures: 2 })
			.where(eq(affiliateLinks.id, link.id));
		for (const status of [403, 429]) {
			restore();
			restore = mockFetch(() => ({ status })).restore;
			expect(await checkLinks([link.id])).toMatchObject({ inconclusive: 1, failed: 0, died: 0 });
			expect(await reload(link.id)).toMatchObject({
				status: "alive",
				consecutiveFailures: 2,
				lastStatusCode: status,
			});
		}
	});

	test("a timeout is inconclusive, a hard network error is a failure", async () => {
		const [slow, broken] = await createLinks(unique("slow"), unique("broken"));
		restore = mockFetch((url) => {
			if (url === slow.url) throw new DOMException("timed out", "TimeoutError");
			throw new TypeError("getaddrinfo ENOTFOUND");
		}).restore;

		expect(await checkLinks([slow.id, broken.id])).toMatchObject({ checked: 2, inconclusive: 1, failed: 1 });
		expect(await reload(slow.id)).toMatchObject({ consecutiveFailures: 0, lastStatusCode: null });
		expect(await reload(broken.id)).toMatchObject({ consecutiveFailures: 1, lastStatusCode: null });
	});

	test("a 200 that landed on the store home page counts as a failure", async () => {
		const [link] = await createLinks(unique("removed"));
		restore = mockFetch((url) => ({ status: 200, finalUrl: `${new URL(url).origin}/` })).restore;
		expect(await checkLinks([link.id])).toMatchObject({ failed: 1, ok: 0 });
		expect(await reload(link.id)).toMatchObject({ consecutiveFailures: 1 });
	});

	test("one alert lists every link that died in the same run", async () => {
		const links = await createLinks(unique("a"), unique("b"));
		for (const link of links)
			await db
				.update(affiliateLinks)
				.set({ consecutiveFailures: DEAD_AFTER_FAILURES - 1 })
				.where(eq(affiliateLinks.id, link.id));
		const net = mockFetch(() => ({ status: 410 }));
		restore = net.restore;

		expect(await checkLinks(links.map((l) => l.id))).toMatchObject({ checked: 2, died: 2 });
		expect(net.telegram).toHaveLength(1);
		for (const link of links) expect(net.telegram[0]?.text).toContain(link.url);
	});

	test("without ids it checks never-checked links before recently checked ones", async () => {
		const [fresh] = await createLinks(unique("fresh"));
		const seen: string[] = [];
		restore = mockFetch((url) => {
			seen.push(url);
			return { status: 200 };
		}).restore;

		const summary = await checkLinks();
		expect(summary.checked).toBeGreaterThan(0);
		expect(seen).toContain(fresh.url);
		expect((await reload(fresh.id)).status).toBe("alive");
	});
});
