// Pure rules for affiliate links: no I/O here, so everything is unit-testable (lib/links.test.ts).
import { z } from "zod";
import type { LinkStatus } from "@/db/schema";

export const DEAD_AFTER_FAILURES = 3;

const STORES: [RegExp, string][] = [
	[/(^|\.)mercadoli[vb]re\.com(\.br)?$|(^|\.)meli\.la$/, "mercadolivre"],
	[/(^|\.)amazon\.com(\.br)?$|(^|\.)amzn\.to$/, "amazon"],
	[/(^|\.)shopee\.com(\.br)?$|(^|\.)shope\.ee$/, "shopee"],
	[/(^|\.)aliexpress\.com$/, "aliexpress"],
	[/(^|\.)magazineluiza\.com\.br$|(^|\.)magazinevoce\.com\.br$/, "magalu"],
	[/(^|\.)hotmart\.com$/, "hotmart"],
];

export function detectStore(url: string): string {
	const host = new URL(url).hostname.toLowerCase();
	return STORES.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, "");
}

const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/;

/** http(s) only and no loopback/private hosts: these URLs are fetched server-side by the health check (SSRF). */
export function isPublicHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === "https:" || url.protocol === "http:") && !PRIVATE_HOST.test(url.hostname);
	} catch {
		return false;
	}
}

export function sameHost(a: string, b: string): boolean {
	try {
		return new URL(a).host === new URL(b).host;
	} catch {
		return false;
	}
}

interface Pickable {
	status: LinkStatus;
	priority: number;
	store?: string;
}

/**
 * First non-dead link by ascending priority. `unknown` is usable: a link not yet checked must still redirect.
 * With `store`, that store is preferred; when it has no usable link the visitor still gets another store.
 */
export function pickLink<T extends Pickable>(links: T[], store?: string): T | undefined {
	const usable = links.filter((l) => l.status !== "dead").sort((a, b) => a.priority - b.priority);
	return (store ? usable.find((l) => l.store === store) : undefined) ?? usable[0];
}

export type CheckResult = "ok" | "failed" | "inconclusive";

export interface Probe {
	/** undefined when the request never got a response. */
	statusCode?: number;
	finalUrl?: string;
	/** true for timeouts/aborts, false for hard network errors (DNS, refused). */
	timedOut?: boolean;
}

/**
 * Stores block bots (403/429) and time out under load, so those never count against a link.
 * A 2xx that landed on the store home page means the product is gone.
 */
export function classifyProbe(originalUrl: string, probe: Probe): CheckResult {
	const { statusCode, finalUrl, timedOut } = probe;
	if (statusCode === undefined) return timedOut ? "inconclusive" : "failed";
	if (statusCode === 403 || statusCode === 429 || statusCode === 401) return "inconclusive";
	if (statusCode >= 400) return "failed";
	if (finalUrl && new URL(originalUrl).pathname !== "/" && new URL(finalUrl).pathname === "/") return "failed";
	return "ok";
}

export interface HealthState {
	status: LinkStatus;
	consecutiveFailures: number;
}

export function nextHealth(current: HealthState, result: CheckResult): HealthState {
	if (result === "ok") return { status: "alive", consecutiveFailures: 0 };
	if (result === "inconclusive") return current;
	const consecutiveFailures = current.consecutiveFailures + 1;
	return { status: consecutiveFailures >= DEAD_AFTER_FAILURES ? "dead" : current.status, consecutiveFailures };
}

const BRASILIA = new Intl.DateTimeFormat("pt-BR", {
	timeZone: "America/Sao_Paulo",
	dateStyle: "short",
	timeStyle: "medium",
});

export interface ClickNotice {
	project: string;
	product: string;
	at: Date;
	/** Page the button belongs to. */
	pageUrl: string;
	/** Store address the visitor was redirected to. */
	targetUrl: string;
}

/** Telegram text for one redirected click. */
export function clickMessage({ project, product, at, pageUrl, targetUrl }: ClickNotice): string {
	return [`🔗 Clique: ${project}`, BRASILIA.format(at), product, `Página: ${pageUrl}`, `Destino: ${targetUrl}`].join(
		"\n",
	);
}

export interface ProjectClicks {
	name: string;
	clicks: number;
}

/** Telegram text for the weekly report: projects by clicks, then the total. */
export function weeklyReportMessage(projects: ProjectClicks[], days: number): string {
	const total = projects.reduce((sum, project) => sum + project.clicks, 0);
	const lines = [...projects]
		.sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name))
		.map((project) => `• ${project.name}: ${project.clicks}`);
	return [
		`📊 Cliques nos últimos ${days} dias`,
		"",
		...(lines.length ? lines : ["Nenhum projeto cadastrado."]),
		"",
		`Total: ${total}`,
	].join("\n");
}

export type Device = "desktop" | "mobile" | "tablet";

export function toDevice(type: string | undefined): Device {
	return type === "mobile" || type === "tablet" ? type : "desktop";
}

const publicUrl = z.string().trim().refine(isPublicHttpUrl, "URL http(s) pública obrigatória");

export const productInput = z.object({
	externalId: z.string().trim().min(1).max(500),
	name: z.string().trim().min(1).max(200).optional(),
	pageUrl: publicUrl.optional(),
	category: z.string().trim().max(100).optional(),
	// min(1): a product without a link would redirect every click back to its own page.
	links: z
		.array(z.object({ url: publicUrl, store: z.string().trim().max(50).optional() }))
		.min(1)
		.max(20),
});
export type ProductInput = z.infer<typeof productInput>;

// v4 seed.json row: { id, category, mercadolivreUrl, amazonUrl, shopeeUrl }
const legacyRow = z
	.object({
		id: z.string(),
		category: z.string().nullish(),
		mercadolivreUrl: z.string().nullish(),
		amazonUrl: z.string().nullish(),
		shopeeUrl: z.string().nullish(),
	})
	.transform((row) => ({
		externalId: row.id,
		...(row.category ? { category: row.category } : {}),
		links: [row.mercadolivreUrl, row.amazonUrl, row.shopeeUrl]
			.filter((u): u is string => !!u)
			.map((url) => ({ url })),
	}));

const importRows = z.array(z.union([productInput, legacyRow.pipe(productInput)])).max(5000);

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((f) => f.trim()));
}

/** CSV header: externalId,url[,name,pageUrl,category,store]. Rows sharing an externalId become one product. */
function csvToProducts(text: string): unknown[] {
	const [header, ...rows] = parseCsv(text);
	if (!header) return [];
	const cols = header.map((h) => h.trim());
	const byId = new Map<string, Record<string, unknown> & { links: unknown[] }>();
	for (const cells of rows) {
		const r = Object.fromEntries(cols.map((c, i) => [c, cells[i]?.trim() || undefined]));
		const key = r.externalId ?? "";
		const product = byId.get(key) ?? { ...r, links: [] };
		if (r.url) product.links.push({ url: r.url, store: r.store });
		byId.set(key, product);
	}
	return [...byId.values()];
}

/** Accepts a JSON array (new format or v4 seed.json) or CSV. Throws ZodError/SyntaxError on bad input. */
export function parseImport(text: string): ProductInput[] {
	const trimmed = text.trim();
	return importRows.parse(trimmed.startsWith("[") ? JSON.parse(trimmed) : csvToProducts(trimmed));
}

export function nameFromExternalId(externalId: string): string {
	const last = externalId.replace(/\/+$/, "").split("/").pop() ?? externalId;
	return last.replace(/[-_]+/g, " ").trim() || externalId;
}
