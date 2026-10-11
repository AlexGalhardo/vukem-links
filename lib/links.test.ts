import { describe, expect, test } from "bun:test";
import {
	classifyProbe,
	DEAD_AFTER_FAILURES,
	detectStore,
	isPublicHttpUrl,
	nextHealth,
	parseImport,
	pickLink,
	toDevice,
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
