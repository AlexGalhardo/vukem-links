import { describe, expect, test } from "bun:test";
import {
	classifyProbe,
	clickMessage,
	DEAD_AFTER_FAILURES,
	detectStore,
	isPublicHttpUrl,
	nextHealth,
	parseImport,
	pickLink,
	productInput,
	toDevice,
	weeklyReportMessage,
} from "./links";

const URL_ML = "https://mercadolivre.com/sec/1BXJGku";

describe("pickLink", () => {
	test("lowest priority among non-dead links", () => {
		const links = [
			{ id: "a", status: "dead" as const, priority: 0 },
			{ id: "b", status: "unknown" as const, priority: 2 },
			{ id: "c", status: "alive" as const, priority: 1 },
		];
		expect(pickLink(links)?.id).toBe("c");
	});
	test("undefined when every link is dead", () => {
		expect(pickLink([{ status: "dead" as const, priority: 0 }])).toBeUndefined();
		expect(pickLink([])).toBeUndefined();
	});
	test("prefers the requested store, falling back to the priority order", () => {
		const links = [
			{ id: "ml", status: "alive" as const, priority: 0, store: "mercadolivre" },
			{ id: "amz-dead", status: "dead" as const, priority: 1, store: "amazon" },
			{ id: "amz", status: "unknown" as const, priority: 2, store: "amazon" },
			{ id: "shopee-dead", status: "dead" as const, priority: 3, store: "shopee" },
		];
		expect(pickLink(links, "amazon")?.id).toBe("amz");
		expect(pickLink(links, "shopee")?.id).toBe("ml");
		expect(pickLink(links, "nope")?.id).toBe("ml");
		expect(pickLink(links, "")?.id).toBe("ml");
	});
});

describe("productInput", () => {
	test("refuses a product without links", () => {
		expect(productInput.safeParse({ externalId: "https://a.example.com/p", links: [] }).success).toBe(false);
		expect(productInput.safeParse({ externalId: "https://a.example.com/p" }).success).toBe(false);
		expect(
			productInput.safeParse({ externalId: "https://a.example.com/p", links: [{ url: URL_ML }] }).success,
		).toBe(true);
	});
});

describe("classifyProbe", () => {
	test("2xx on a product path is ok", () => {
		expect(classifyProbe(URL_ML, { statusCode: 200, finalUrl: "https://www.mercadolivre.com.br/p/MLB1" })).toBe(
			"ok",
		);
	});
	test("404, 410 and 5xx fail", () => {
		for (const statusCode of [404, 410, 500, 503]) expect(classifyProbe(URL_ML, { statusCode })).toBe("failed");
	});
	test("bot blocks and timeouts are inconclusive", () => {
		for (const statusCode of [401, 403, 429]) expect(classifyProbe(URL_ML, { statusCode })).toBe("inconclusive");
		expect(classifyProbe(URL_ML, { timedOut: true })).toBe("inconclusive");
	});
	test("hard network error fails", () => {
		expect(classifyProbe(URL_ML, { timedOut: false })).toBe("failed");
	});
	test("redirect to the store home page fails", () => {
		expect(classifyProbe(URL_ML, { statusCode: 200, finalUrl: "https://www.mercadolivre.com.br/" })).toBe("failed");
	});
});

describe("nextHealth", () => {
	test(`dead only after ${DEAD_AFTER_FAILURES} consecutive failures`, () => {
		let state = { status: "alive" as "alive" | "dead" | "unknown", consecutiveFailures: 0 };
		for (let i = 1; i < DEAD_AFTER_FAILURES; i++) {
			state = nextHealth(state, "failed");
			expect(state.status).toBe("alive");
		}
		expect(nextHealth(state, "failed").status).toBe("dead");
	});
	test("ok revives and resets, inconclusive changes nothing", () => {
		const dead = { status: "dead" as const, consecutiveFailures: 5 };
		expect(nextHealth(dead, "ok")).toEqual({ status: "alive", consecutiveFailures: 0 });
		expect(nextHealth(dead, "inconclusive")).toBe(dead);
	});
});

test("detectStore", () => {
	expect(detectStore(URL_ML)).toBe("mercadolivre");
	expect(detectStore("https://amzn.to/abc")).toBe("amazon");
	expect(detectStore("https://s.shopee.com.br/xyz")).toBe("shopee");
	expect(detectStore("https://www.example.org/p")).toBe("example.org");
});

test("isPublicHttpUrl blocks non-http and private hosts", () => {
	expect(isPublicHttpUrl(URL_ML)).toBe(true);
	for (const bad of [
		"javascript:alert(1)",
		"ftp://x.com",
		"http://localhost:3000",
		"http://127.0.0.1",
		"http://10.0.0.1",
		"http://192.168.0.1",
		"http://169.254.169.254/latest",
		"http://[::1]/",
		"nope",
	])
		expect(isPublicHttpUrl(bad)).toBe(false);
});

test("toDevice", () => {
	expect(toDevice("mobile")).toBe("mobile");
	expect(toDevice("tablet")).toBe("tablet");
	expect(toDevice(undefined)).toBe("desktop");
	expect(toDevice("smarttv")).toBe("desktop");
});

describe("parseImport", () => {
	test("v4 seed.json rows", () => {
		const rows = parseImport(
			JSON.stringify([
				{
					id: "https://app.x.com/c/p1",
					category: "c",
					mercadolivreUrl: URL_ML,
					amazonUrl: null,
					shopeeUrl: null,
				},
			]),
		);
		expect(rows).toEqual([{ externalId: "https://app.x.com/c/p1", category: "c", links: [{ url: URL_ML }] }]);
	});
	test("csv groups rows by externalId and handles quotes", () => {
		const csv = `externalId,url,name\np1,${URL_ML},"Fone, modelo ""X"""\np1,https://amzn.to/abc,\n`;
		const rows = parseImport(csv);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe('Fone, modelo "X"');
		expect(rows[0]?.links.map((l) => l.url)).toEqual([URL_ML, "https://amzn.to/abc"]);
	});
	test("rejects unsafe urls", () => {
		expect(() =>
			parseImport(JSON.stringify([{ externalId: "p", links: [{ url: "javascript:alert(1)" }] }])),
		).toThrow();
	});
});

describe("clickMessage", () => {
	test("names the project, the Brasília time, the product, the page and the destination", () => {
		const text = clickMessage({
			project: "EletroRadar",
			product: "Airfryer Arno",
			at: new Date("2026-10-11T20:03:21Z"),
			pageUrl: "https://example.com/melhor-airfryer",
			targetUrl: "https://meli.la/abc",
		});
		expect(text.split("\n")).toEqual([
			"🔗 Clique: EletroRadar",
			"11/10/2026, 17:03:21",
			"Airfryer Arno",
			"Página: https://example.com/melhor-airfryer",
			"Destino: https://meli.la/abc",
		]);
	});
});

describe("weeklyReportMessage", () => {
	test("lists projects by clicks, keeps the ones with none and ends with the total", () => {
		const text = weeklyReportMessage(
			[
				{ name: "Tudo Hardware", clicks: 3 },
				{ name: "Novo", clicks: 0 },
				{ name: "EletroRadar", clicks: 12 },
			],
			7,
		);
		expect(text.split("\n")).toEqual([
			"📊 Cliques nos últimos 7 dias",
			"",
			"• EletroRadar: 12",
			"• Tudo Hardware: 3",
			"• Novo: 0",
			"",
			"Total: 15",
		]);
	});

	test("says so when there is no project", () => {
		expect(weeklyReportMessage([], 7)).toContain("Nenhum projeto cadastrado.");
		expect(weeklyReportMessage([], 7)).toContain("Total: 0");
	});
});
