// Integration tests for the route handlers that do not depend on a Next request scope.
// /link and /api/links use next/headers and after(): they are covered end to end by qa.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { GET as cron } from "@/app/api/cron/health/route";
import { GET as weekly } from "@/app/api/cron/weekly/route";
import { POST as registerLinks, PUT as syncLinks } from "@/app/api/v1/links/route";
import { GET as health } from "@/app/health/route";
import { listLinks, upsertProducts } from "@/lib/data";
import { createProject, mockFetch } from "@/test/helpers";

let restore = (): void => {};
afterEach(() => restore());

const API_KEY = "test-api-key";

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
		// The route refuses links for a site that is offline: by default the project site answers.
		restore = mockFetch(() => ({ status: 200 })).restore;
		const project = await createProject();
		const token = API_KEY;
		const post = (body: unknown, bearer: string | null = token): Promise<Response> =>
			registerLinks(
				new Request(`http://localhost/api/v1/links?site=${project.baseUrl}`, {
					method: "POST",
					headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` },
					body: typeof body === "string" ? body : JSON.stringify(body),
				}),
			);
		return { project, token, post };
	}

	test("401 without a key, with a wrong key, with a longer key and when the key is not configured", async () => {
		const { project, token, post } = await setup();
		const body = { externalId: `${project.baseUrl}/p`, links: [{ url: "https://amzn.to/x" }] };
		expect((await post(body, null)).status).toBe(401);
		expect((await post(body, "la_unknown")).status).toBe(401);
		expect((await post(body, `${token}-and-more`)).status).toBe(401);
		delete process.env.LINKS_API_KEY;
		try {
			expect((await post(body, token)).status).toBe(401);
			expect((await post(body, "undefined")).status).toBe(401);
		} finally {
			process.env.LINKS_API_KEY = token;
		}
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

describe("project site must be online", () => {
	test("409 on POST and PUT while the site does not answer, writing nothing", async () => {
		const project = await createProject();
		const token = API_KEY;
		const body = JSON.stringify([{ externalId: `${project.baseUrl}/p`, links: [{ url: "https://amzn.to/x" }] }]);
		const request = (method: string): Request =>
			new Request(`http://localhost/api/v1/links?site=${project.baseUrl}`, {
				method,
				headers: { authorization: `Bearer ${token}` },
				body,
			});
		for (const offline of [
			() => ({ status: 503 }),
			() => {
				throw new TypeError("getaddrinfo ENOTFOUND");
			},
		]) {
			restore = mockFetch(offline).restore;
			for (const res of [await registerLinks(request("POST")), await syncLinks(request("PUT"))]) {
				expect(res.status).toBe(409);
				expect(await res.json()).toEqual({ error: "project_offline", baseUrl: project.baseUrl });
			}
			restore();
		}
		expect((await listLinks()).filter((l) => l.projectSlug === project.slug)).toHaveLength(0);
	});

	test("an invalid token or body is answered before the site is probed", async () => {
		let fetched = 0;
		restore = mockFetch(() => {
			fetched++;
			return { status: 200 };
		}).restore;
		const project = await createProject();
		const token = API_KEY;
		const call = (bearer: string, body: string): Promise<Response> =>
			syncLinks(
				new Request(`http://localhost/api/v1/links?site=${project.baseUrl}`, {
					method: "PUT",
					headers: { authorization: `Bearer ${bearer}` },
					body,
				}),
			);
		expect((await call("la_unknown", "[]")).status).toBe(401);
		expect((await call(token, "[]")).status).toBe(400);
		expect(fetched).toBe(0);
	});
});

describe("PUT /api/v1/links", () => {
	async function setup() {
		restore = mockFetch(() => ({ status: 200 })).restore;
		const project = await createProject();
		const token = API_KEY;
		const put = (body: unknown, bearer: string | null = token): Promise<Response> =>
			syncLinks(
				new Request(`http://localhost/api/v1/links?site=${project.baseUrl}`, {
					method: "PUT",
					headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` },
					body: typeof body === "string" ? body : JSON.stringify(body),
				}),
			);
		const own = async () => (await listLinks()).filter((l) => l.projectSlug === project.slug);
		return { project, put, own };
	}

	test("401 without a valid token", async () => {
		const { project, put, own } = await setup();
		const body = [{ externalId: `${project.baseUrl}/p`, links: [{ url: "https://amzn.to/x" }] }];
		expect((await put(body, null)).status).toBe(401);
		expect((await put(body, "la_unknown")).status).toBe(401);
		expect(await own()).toHaveLength(0);
	});

	test("200 makes the project match the payload: adds, replaces and removes", async () => {
		const { project, put, own } = await setup();
		const a = `${project.baseUrl}/a`;
		const b = `${project.baseUrl}/b`;
		const first = await put([
			{ externalId: a, links: [{ url: "https://amzn.to/a" }, { url: "https://s.shopee.com.br/a" }] },
			{ externalId: b, links: [{ url: "https://amzn.to/b" }] },
		]);
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({ productsCreated: 2, linksAdded: 3, productsRemoved: 0 });

		const second = await put([{ externalId: a, links: [{ url: "https://meli.la/a" }] }]);
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ linksAdded: 1, linksRemoved: 2, productsRemoved: 1 });
		expect((await own()).map((l) => [l.externalId, l.url, l.store])).toEqual([
			[a, "https://meli.la/a", "mercadolivre"],
		]);
	});

	test("400 for an empty catalogue, a product without links, repeated ids and bad JSON, removing nothing", async () => {
		const { project, put, own } = await setup();
		const a = `${project.baseUrl}/a`;
		await put([{ externalId: a, links: [{ url: "https://amzn.to/a" }] }]);
		const link = { url: "https://amzn.to/z" };
		const bodies: unknown[] = [
			"{not json",
			[],
			{ externalId: a, links: [link] },
			[{ externalId: a, links: [] }],
			[
				{ externalId: a, links: [link] },
				{ externalId: a, links: [link] },
			],
			[{ externalId: a, links: [{ url: "http://127.0.0.1/admin" }] }],
		];
		for (const body of bodies) expect((await put(body)).status).toBe(400);
		expect((await own()).map((l) => l.url)).toEqual(["https://amzn.to/a"]);
	});

	test("207 when an item is refused, still applying the rest", async () => {
		const { project, put, own } = await setup();
		const res = await put([
			{ externalId: `${project.baseUrl}/ok`, links: [{ url: "https://amzn.to/ok" }] },
			{ externalId: "https://elsewhere.example.org/p", links: [{ url: "https://amzn.to/no" }] },
		]);
		expect(res.status).toBe(207);
		expect(((await res.json()) as { errors: string[] }).errors).toHaveLength(1);
		expect(await own()).toHaveLength(1);
	});
});

describe("GET /api/cron/weekly", () => {
	const call = (authorization?: string): Promise<Response> =>
		weekly(new Request("http://localhost/api/cron/weekly", { headers: authorization ? { authorization } : {} }));

	test("rejects a missing or wrong secret without sending anything", async () => {
		const mocked = mockFetch(() => ({ status: 200 }));
		restore = mocked.restore;
		for (const header of [undefined, "Bearer wrong", "test-cron-secret", "Bearer "])
			expect((await call(header)).status).toBe(401);
		expect(mocked.telegram).toHaveLength(0);
	});

	test("with the right secret sends one report with every project", async () => {
		const mocked = mockFetch(() => ({ status: 200 }));
		restore = mocked.restore;
		const project = await createProject();

		const res = await call("Bearer test-cron-secret");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { days: number; projects: { name: string; clicks: number }[] };
		expect(body.days).toBe(7);
		expect(body.projects.find((row) => row.name === project.name)).toEqual({ name: project.name, clicks: 0 });
		expect(mocked.telegram).toHaveLength(1);
		expect(mocked.telegram[0]?.text).toContain("📊 Cliques nos últimos 7 dias");
		expect(mocked.telegram[0]?.text).toContain(`• ${project.name}: 0`);
	});
});

describe("site identification", () => {
	const call = (query: string, body: unknown): Promise<Response> =>
		syncLinks(
			new Request(`http://localhost/api/v1/links${query}`, {
				method: "PUT",
				headers: { authorization: `Bearer ${API_KEY}` },
				body: JSON.stringify(body),
			}),
		);

	test("400 without ?site or with a site that is not a public http(s) address", async () => {
		restore = mockFetch(() => ({ status: 200 })).restore;
		const body = [{ externalId: "https://x.example.com/p", links: [{ url: "https://amzn.to/x" }] }];
		for (const query of ["", "?site=", "?site=nope", "?site=ftp://x.example.com", "?site=http://127.0.0.1"]) {
			const res = await call(query, body);
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "invalid_site" });
		}
	});

	test("a site seen for the first time becomes a project, and its origin is the base URL", async () => {
		restore = mockFetch(() => ({ status: 200 })).restore;
		const host = `estreia-${crypto.randomUUID().slice(0, 8)}.example.com`;
		const body = [{ externalId: `https://${host}/post/a`, links: [{ url: "https://amzn.to/a" }] }];
		const first = await call(`?site=https://${host}/qualquer/caminho?x=1`, body);
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({ productsCreated: 1, linksAdded: 1 });
		const created = (await listLinks()).filter((l) => l.externalId === `https://${host}/post/a`);
		expect(created.map((l) => l.projectSlug)).toEqual([host.replaceAll(".", "-")]);

		const again = await call(`?site=https://${host}`, body);
		expect(await again.json()).toMatchObject({ productsCreated: 0, linksAdded: 0 });
	});

	test("a site that is offline is not turned into a project", async () => {
		restore = mockFetch(() => ({ status: 503 })).restore;
		const host = `fora-${crypto.randomUUID().slice(0, 8)}.example.com`;
		const res = await call(`?site=https://${host}`, [
			{ externalId: `https://${host}/p`, links: [{ url: "https://amzn.to/a" }] },
		]);
		expect(res.status).toBe(409);
		expect((await listLinks()).some((l) => l.externalId === `https://${host}/p`)).toBe(false);
	});

	test("one site cannot write into another site's products", async () => {
		restore = mockFetch(() => ({ status: 200 })).restore;
		const owner = await createProject();
		const theirs = `${owner.baseUrl}/theirs`;
		await upsertProducts(owner, [{ externalId: theirs, links: [{ url: "https://amzn.to/owner" }] }]);
		const intruder = await createProject();
		const res = await call(`?site=${intruder.baseUrl}`, [
			{ externalId: theirs, links: [{ url: "https://amzn.to/intruder" }] },
			{ externalId: `${intruder.baseUrl}/mine`, links: [{ url: "https://amzn.to/mine" }] },
		]);
		expect(res.status).toBe(207);
		expect((await listLinks()).filter((l) => l.externalId === theirs).map((l) => l.url)).toEqual([
			"https://amzn.to/owner",
		]);
	});
});

describe("GET /health", () => {
	test("answers ok to any origin while the database responds", async () => {
		const res = await health();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ok" });
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});
});
