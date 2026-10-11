// Integration tests for the route handlers that do not depend on a Next request scope.
// /link and /api/links use next/headers and after(): they are covered end to end by qa.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { GET as cron } from "@/app/api/cron/health/route";
import { POST as registerLinks } from "@/app/api/v1/links/route";
import { listLinks, rotateApiToken, upsertProducts } from "@/lib/data";
import { createProject, mockFetch } from "@/test/helpers";

let restore = (): void => {};
afterEach(() => restore());

describe("GET /api/cron/health", () => {
	const call = (authorization?: string): Promise<Response> =>
		cron(new Request("http://localhost/api/cron/health", { headers: authorization ? { authorization } : {} }));

	test("rejects a missing, wrong or malformed secret without checking anything", async () => {
		let fetched = 0;
		restore = mockFetch(() => {
			fetched++;
			return { status: 200 };
		}).restore;
		for (const header of [
			undefined,
			"Bearer wrong",
			"test-cron-secret",
			"Bearer test-cron-secret-and-more",
			"Bearer ",
		])
			expect((await call(header)).status).toBe(401);
		expect(fetched).toBe(0);
	});

	test("rejects every call when CRON_SECRET is not configured", async () => {
		const secret = process.env.CRON_SECRET;
		delete process.env.CRON_SECRET;
		try {
			expect((await call("Bearer undefined")).status).toBe(401);
			expect((await call("Bearer ")).status).toBe(401);
		} finally {
			process.env.CRON_SECRET = secret;
		}
	});

	test("with the right secret runs a batch and returns its summary", async () => {
		const project = await createProject();
		const url = `https://cron-${project.slug}.example.com/p`;
		await upsertProducts(project, [{ externalId: `${project.baseUrl}/cron`, links: [{ url }] }]);
		restore = mockFetch(() => ({ status: 200 })).restore;

		const res = await call("Bearer test-cron-secret");
		expect(res.status).toBe(200);
		const summary = (await res.json()) as { checked: number; ok: number; failed: number };
		expect(summary.checked).toBeGreaterThan(0);
		expect(summary.ok).toBe(summary.checked);
		const link = (await listLinks()).find((l) => l.url === url);
		expect(link?.status).toBe("alive");
	});
});

describe("POST /api/v1/links", () => {
	async function setup() {
		const project = await createProject();
		const token = await rotateApiToken(project.id);
		const post = (body: unknown, bearer: string | null = token): Promise<Response> =>
			registerLinks(
				new Request("http://localhost/api/v1/links", {
					method: "POST",
					headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` },
					body: typeof body === "string" ? body : JSON.stringify(body),
				}),
			);
		return { project, token, post };
	}

	test("401 without a token, with an unknown token or with a rotated-away token", async () => {
		const { project, token, post } = await setup();
		const body = { externalId: `${project.baseUrl}/p`, links: [{ url: "https://amzn.to/x" }] };
		expect((await post(body, null)).status).toBe(401);
		expect((await post(body, "la_unknown")).status).toBe(401);
		await rotateApiToken(project.id);
		expect((await post(body, token)).status).toBe(401);
		expect((await listLinks()).filter((l) => l.projectSlug === project.slug)).toHaveLength(0);
	});

	test("201 creates a single product or an array, in the token's project only", async () => {
		const { project, post } = await setup();
		const one = await post({ externalId: `${project.baseUrl}/one`, links: [{ url: "https://amzn.to/one" }] });
		expect(one.status).toBe(201);
		expect(await one.json()).toEqual({ productsCreated: 1, linksAdded: 1, errors: [] });

		const many = await post([
			{ externalId: `${project.baseUrl}/two`, links: [{ url: "https://amzn.to/two" }] },
			{ externalId: `${project.baseUrl}/three`, links: [{ url: "https://s.shopee.com.br/three" }] },
		]);
		expect(many.status).toBe(201);
		const own = (await listLinks()).filter((l) => l.projectSlug === project.slug);
		expect(own.map((l) => l.store).sort()).toEqual(["amazon", "amazon", "shopee"]);
	});

	test("400 for malformed JSON, missing fields, unsafe URLs and oversized batches", async () => {
		const { project, post } = await setup();
		const id = `${project.baseUrl}/bad`;
		const bodies: unknown[] = [
			"{not json",
			{},
			{ externalId: id },
			{ externalId: "", links: [] },
			{ externalId: id, links: [{ url: "javascript:alert(1)" }] },
			{ externalId: id, links: [{ url: "http://127.0.0.1/admin" }] },
			{ externalId: id, pageUrl: "file:///etc/passwd", links: [] },
			[],
			Array.from({ length: 501 }, (_, i) => ({ externalId: `${id}/${i}`, links: [] })),
		];
		for (const body of bodies) expect((await post(body)).status).toBe(400);
		expect((await listLinks()).filter((l) => l.projectSlug === project.slug)).toHaveLength(0);
	});

	test("207 when part of the batch is refused, keeping the valid part", async () => {
		const { project, post } = await setup();
		const res = await post([
			{ externalId: `${project.baseUrl}/ok`, links: [{ url: "https://amzn.to/ok" }] },
			{ externalId: "https://elsewhere.example.org/p", links: [{ url: "https://amzn.to/no" }] },
		]);
		expect(res.status).toBe(207);
		const summary = (await res.json()) as { productsCreated: number; errors: string[] };
		expect(summary.productsCreated).toBe(1);
		expect(summary.errors).toHaveLength(1);
	});
});
