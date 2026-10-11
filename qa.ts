/**
 * qa.ts — autonomous end-to-end QA for links-afiliados.
 *
 * Drives the running app like a careful tester: public surface, authorization of every API route,
 * login, the full project/product/link CRUD through the UI, the public redirect with click tracking
 * (device, bot, referer), the health check and fallback chain, the project API and injection attempts.
 * It creates its own project (unique per run) and deletes it at the end; it only needs the admin account.
 *
 * Run (from the repo root, with the app already running):
 *   bun qa.ts [baseUrl] [flags]
 *   bun qa.ts http://localhost:3000 --report=qa-report.json
 *
 * Flags:
 *   --allow-remote      allow a non-local baseUrl (refused by default; never production)
 *   --report=<path>     write a JSON report to <path>
 *   --admin-email=...   admin login (default $ADMIN_EMAIL or admin@example.com)
 *   --admin-password=.. admin password (default $ADMIN_PASSWORD)
 *   --headed            run the browser headed (debugging)
 *
 * Exit code is 1 if any check FAILed. See docs/qa.md.
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type APIRequestContext,
	type BrowserContext,
	chromium,
	type Page,
	request as playwrightRequest,
} from "@playwright/test";

type Status = "PASS" | "FAIL" | "SKIP";

interface Check {
	suite: string;
	name: string;
	status: Status;
	reason: string;
}

const checks: Check[] = [];
let currentSuite = "";

function record(status: Status, name: string, reason: string): void {
	checks.push({ suite: currentSuite, name, status, reason });
	console.log(`  [${status}] ${name}${reason ? ` — ${reason}` : ""}`);
}

function assert(name: string, condition: boolean, reason = ""): boolean {
	record(condition ? "PASS" : "FAIL", name, condition ? "" : reason);
	return condition;
}

/** A thrown error inside a suite is a FAIL of that step, never a crash of the whole run. */
async function guarded(name: string, body: () => Promise<void>): Promise<void> {
	try {
		await body();
	} catch (error) {
		record("FAIL", name, error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error));
	}
}

function suite(name: string): void {
	currentSuite = name;
	console.log(`\n${name}`);
}

interface Args {
	baseUrl: string;
	flags: Map<string, string>;
}

const KNOWN_FLAGS = ["allow-remote", "report", "admin-email", "admin-password", "headed"];

function parseArgs(argv: string[]): Args {
	const flags = new Map<string, string>();
	let baseUrl = "http://localhost:3000";
	for (const arg of argv) {
		if (!arg.startsWith("--")) {
			baseUrl = arg.replace(/\/+$/, "");
			continue;
		}
		const [key = "", value = "true"] = arg.slice(2).split("=");
		if (!KNOWN_FLAGS.includes(key)) throw new Error(`Unknown flag --${key}. Known: ${KNOWN_FLAGS.join(", ")}`);
		flags.set(key, value);
	}
	return { baseUrl, flags };
}

const MOBILE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const XSS_NAME = "<img src=x onerror=window.__qaXss=1>QA";
const SQLI_PAYLOADS = ["' OR '1'='1", "'; DROP TABLE user; --", "admin'--"];

const RUN = Date.now().toString(36);
const PROJECT = { name: `QA ${RUN}`, slug: `qa-${RUN}`, baseUrl: `https://qa-${RUN}.example.com` };
const PRODUCT_ID = `${PROJECT.baseUrl}/produto/fone`;
// .invalid never resolves (RFC 2606): the health check fails fast and deterministically, with no real store involved.
const LINK_A = `https://a-${RUN}.invalid/oferta`;
const LINK_B = `https://b-${RUN}.invalid/oferta`;

interface LinkRow {
	id: string;
	url: string;
	store: string;
	externalId: string;
	status: string;
	priority: number;
	clicks: number;
	mobile: number;
	productName: string;
	projectSlug: string;
}

async function ownLinks(api: APIRequestContext): Promise<LinkRow[]> {
	const rows = (await (await api.get("/api/links")).json()) as LinkRow[];
	return rows.filter((l) => l.projectSlug === PROJECT.slug);
}

async function redirectTarget(
	api: APIRequestContext,
	externalId: string,
	userAgent: string,
	referer?: string,
): Promise<string> {
	const res = await api.get(`/link?id=${encodeURIComponent(externalId)}`, {
		maxRedirects: 0,
		// Vercel sets this header at the edge in production; locally the QA plays that role.
		headers: { "User-Agent": userAgent, "x-vercel-ip-country": "BR", ...(referer ? { Referer: referer } : {}) },
	});
	return `${res.status()} ${res.headers().location ?? ""}`;
}

/** Recursively lists app/api route files as URL paths. */
function apiRoutes(dir = join("app", "api"), prefix = "/api"): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isDirectory()) return apiRoutes(join(dir, entry.name), `${prefix}/${entry.name}`);
		return entry.name === "route.ts" ? [prefix] : [];
	});
}

async function suitePublicSurface(anon: APIRequestContext): Promise<void> {
	suite("1. Public surface");
	await guarded("public surface", async () => {
		const login = await anon.get("/login");
		assert("/login renders", login.status() === 200, `status ${login.status()}`);
		const headers = login.headers();
		assert("X-Content-Type-Options: nosniff", headers["x-content-type-options"] === "nosniff");
		assert("X-Frame-Options: DENY", headers["x-frame-options"] === "DENY");
		assert("X-Powered-By is hidden", headers["x-powered-by"] === undefined);

		for (const path of ["/", "/links", "/projects", "/links/anything", "/projects/anything"]) {
			const res = await anon.get(path, { maxRedirects: 0 });
			const location = res.headers().location ?? "";
			assert(
				`${path} redirects anonymous visitors to /login`,
				res.status() === 307 && location.endsWith("/login"),
				`${res.status()} ${location}`,
			);
		}
		assert("/link without id is 404", (await anon.get("/link", { maxRedirects: 0 })).status() === 404);
		assert(
			"/link with unknown id is 404",
			(await anon.get("/link?id=does-not-exist", { maxRedirects: 0 })).status() === 404,
		);
		const evil = await anon.get(`/link?id=${encodeURIComponent("https://evil.example.com")}`, { maxRedirects: 0 });
		assert("/link never redirects to an unregistered URL", evil.status() === 404, `status ${evil.status()}`);
	});
}

async function suiteAuthorization(anon: APIRequestContext): Promise<void> {
	suite("2. Authorization — anonymous API calls");
	await guarded("authorization", async () => {
		const routes = apiRoutes();
		assert("API routes were discovered on disk", routes.length >= 4, `found ${routes.join(", ")}`);
		// Every route must be listed here: a new route without an explicit expectation fails the run.
		const expectations: Record<string, () => Promise<number>> = {
			"/api/links": async () => (await anon.get("/api/links")).status(),
			"/api/cron/health": async () => (await anon.get("/api/cron/health")).status(),
			"/api/v1/links": async () =>
				(await anon.post("/api/v1/links", { data: { externalId: "x", links: [] } })).status(),
			"/api/auth/[...all]": async () => (await anon.get("/api/auth/list-sessions")).status(),
		};
		for (const route of routes) {
			const probe = expectations[route];
			if (!probe) {
				record("FAIL", `${route} has an authorization check in qa.ts`, "new route: add it to `expectations`");
				continue;
			}
			const status = await probe();
			assert(`${route} rejects anonymous calls`, status === 401, `status ${status}`);
		}
		const wrongCron = await anon.get("/api/cron/health", { headers: { Authorization: "Bearer wrong" } });
		assert("cron rejects a wrong secret", wrongCron.status() === 401, `status ${wrongCron.status()}`);
		const wrongToken = await anon.post("/api/v1/links", {
			headers: { Authorization: "Bearer la_wrong" },
			data: { externalId: "x", links: [] },
		});
		assert("project API rejects a wrong token", wrongToken.status() === 401, `status ${wrongToken.status()}`);
		const signUp = await anon.post("/api/auth/sign-up/email", {
			data: { email: `qa-${RUN}@example.com`, password: "QaTest!2345", name: "qa" },
		});
		assert("public sign-up is disabled", signUp.status() >= 400, `status ${signUp.status()}`);
	});
}

async function login(page: Page, email: string, password: string): Promise<void> {
	await page.goto("/login");
	await page.getByLabel("E-mail").fill(email);
	// exact: the show/hide toggle is labelled "Mostrar senha", which a substring match would also hit.
	await page.getByLabel("Senha", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Entrar" }).click();
}

async function suiteCrud(page: Page, api: APIRequestContext): Promise<void> {
	suite("3. Project, product and link CRUD (UI)");
	await guarded("create project", async () => {
		await page.goto("/projects");
		await page.getByRole("button", { name: "Novo projeto" }).click();
		await page.getByLabel("Nome").fill(PROJECT.name);
		await page.getByLabel("Slug").fill(PROJECT.slug);
		await page.getByLabel("URL base").fill(`${PROJECT.baseUrl}/qualquer/caminho`);
		await page.getByRole("button", { name: "Criar", exact: true }).click();
		await page.getByRole("link", { name: PROJECT.name }).waitFor();
		record("PASS", "project is created and listed", "");
	});

	await guarded("create product with two links", async () => {
		await page.goto(`/projects/${PROJECT.slug}`);
		await page.getByText(PROJECT.baseUrl, { exact: true }).waitFor();
		record("PASS", "base URL is normalized to its origin", "");
		await page.getByRole("button", { name: "Novo link" }).click();
		await page.getByLabel("ID do produto (externalId)").fill(PRODUCT_ID);
		await page.getByLabel("Nome").fill(XSS_NAME);
		await page.getByLabel(/Links de afiliado/).fill(`${LINK_A}\n${LINK_B}`);
		await page.getByRole("button", { name: "Salvar" }).click();
		await page.getByText(LINK_A).waitFor();
		const links = await ownLinks(api);
		assert("two links are stored", links.length === 2, `got ${links.length}`);
		const [first, second] = links.sort((a, b) => a.priority - b.priority);
		assert("priority follows the typed order", first?.url === LINK_A && second?.url === LINK_B);
		assert(
			"new links start as unknown",
			links.every((l) => l.status === "unknown"),
		);
	});

	await guarded("stored XSS", async () => {
		assert("product name is rendered as text in the table", (await page.locator("img[onerror]").count()) === 0);
		assert("XSS payload did not execute", (await page.evaluate(() => "__qaXss" in window)) === false);
		const [link] = await ownLinks(api);
		await page.goto(`/links/${link?.id}`);
		await page.getByRole("heading", { name: XSS_NAME }).waitFor();
		assert(
			"product name is rendered as text on the detail page",
			(await page.locator("img[onerror]").count()) === 0,
		);
	});

	await guarded("input validation", async () => {
		await page.goto(`/projects/${PROJECT.slug}`);
		await page.getByRole("button", { name: "Novo link" }).click();
		await page.getByLabel("ID do produto (externalId)").fill(`${PROJECT.baseUrl}/produto/js`);
		await page.getByLabel(/Links de afiliado/).fill("javascript:alert(1)");
		await page.getByRole("button", { name: "Salvar" }).click();
		await page.getByText("URL http(s) pública obrigatória").first().waitFor();
		record("PASS", "javascript: URL is rejected", "");
		await page.getByLabel(/Links de afiliado/).fill("http://169.254.169.254/latest/meta-data");
		await page.getByRole("button", { name: "Salvar" }).click();
		await page.getByText("URL http(s) pública obrigatória").nth(1).waitFor();
		record("PASS", "private-network URL is rejected (SSRF)", "");
		await page.getByLabel(/Links de afiliado/).fill(LINK_A);
		await page.getByLabel("Página do produto").fill("https://evil.example.org/phish");
		await page.getByRole("button", { name: "Salvar" }).click();
		await page.getByText("pageUrl fora do domínio do projeto").waitFor();
		record("PASS", "product page outside the project domain is rejected (open redirect)", "");
		assert("no product was created by rejected input", (await ownLinks(api)).length === 2);
	});

	await guarded("table filters", async () => {
		await page.goto("/links");
		const search = page.getByRole("searchbox", { name: "Buscar links" });
		await search.fill(`a-${RUN}.invalid`);
		await page.getByText("1 links").waitFor();
		record("PASS", "search narrows the table to the matching link", "");
		await search.fill(`zz-no-match-${RUN}`);
		await page.getByText("Nenhum link encontrado.").waitFor();
		record("PASS", "empty state is shown when nothing matches", "");
	});
}

async function suiteRedirect(page: Page, api: APIRequestContext, anon: APIRequestContext): Promise<void> {
	suite("4. Redirect, click tracking, health check and fallback");
	const referer = `${PROJECT.baseUrl}/produto/fone?utm_source=qa&email=someone@example.com`;

	await guarded("redirect and tracking", async () => {
		assert(
			"mobile visitor goes to the first link",
			(await redirectTarget(anon, PRODUCT_ID, MOBILE_UA, referer)) === `302 ${LINK_A}`,
		);
		assert(
			"desktop visitor goes to the first link",
			(await redirectTarget(anon, PRODUCT_ID, DESKTOP_UA)) === `302 ${LINK_A}`,
		);
		assert("bot is redirected too", (await redirectTarget(anon, PRODUCT_ID, BOT_UA)) === `302 ${LINK_A}`);
		await page.waitForTimeout(1500);
		const a = (await ownLinks(api)).find((l) => l.url === LINK_A);
		assert("two human clicks are counted, the bot is not", a?.clicks === 2, `clicks=${a?.clicks}`);
		assert("one click is mobile", a?.mobile === 1, `mobile=${a?.mobile}`);
		await page.goto(`/links/${a?.id}`);
		await page.getByText(`${PROJECT.baseUrl}/produto/fone`, { exact: true }).first().waitFor();
		assert(
			"referer is stored without its query string",
			(await page.getByText("someone@example.com").count()) === 0,
		);
		assert("device breakdown shows Mobile", (await page.getByText("Mobile", { exact: true }).count()) > 0);
		assert("country comes from the edge header", (await page.getByText("BR", { exact: true }).count()) > 0);
		assert(
			"OS and browser are parsed from the user agent",
			(await page.getByText("iOS", { exact: true }).count()) > 0 &&
				(await page.getByText("Mobile Safari", { exact: true }).count()) > 0,
		);
	});

	async function killLink(url: string): Promise<void> {
		const link = (await ownLinks(api)).find((l) => l.url === url);
		await page.goto(`/links/${link?.id}`);
		for (let attempt = 1; attempt <= 3; attempt++) {
			await page.getByRole("button", { name: "Checar agora" }).click();
			await page.getByText(`${attempt} falha(s) seguidas`).waitFor({ timeout: 30_000 });
		}
	}

	await guarded("health check and fallback", async () => {
		await killLink(LINK_A);
		const afterA = await ownLinks(api);
		assert("link is dead after 3 consecutive failures", afterA.find((l) => l.url === LINK_A)?.status === "dead");
		assert("sibling link is untouched", afterA.find((l) => l.url === LINK_B)?.status === "unknown");
		assert(
			"redirect falls back to the next live link",
			(await redirectTarget(anon, PRODUCT_ID, DESKTOP_UA)) === `302 ${LINK_B}`,
		);
		await killLink(LINK_B);
		assert(
			"with every link dead the visitor returns to the product page",
			(await redirectTarget(anon, PRODUCT_ID, DESKTOP_UA)) === `302 ${PRODUCT_ID}`,
		);
	});

	await guarded("edit and promote", async () => {
		const b = (await ownLinks(api)).find((l) => l.url === LINK_B);
		await page.goto(`/links/${b?.id}`);
		await page.getByRole("button", { name: "Tornar principal" }).click();
		await page.getByText("Link agora é a primeira opção do produto").waitFor();
		const sorted = (await ownLinks(api)).sort((x, y) => x.priority - y.priority);
		assert("promoted link becomes first in the fallback order", sorted[0]?.url === LINK_B);

		const edited = `https://c-${RUN}.invalid/oferta`;
		await page.getByRole("button", { name: "Editar" }).click();
		await page.getByLabel("URL de afiliado").fill(edited);
		await page.getByRole("button", { name: "Salvar" }).click();
		await page.getByText("Link atualizado").waitFor();
		const c = (await ownLinks(api)).find((l) => l.url === edited);
		assert("changing the URL resets health to unknown", c?.status === "unknown", `status=${c?.status}`);
		assert(
			"the edited link is live again in the redirect",
			(await redirectTarget(anon, PRODUCT_ID, DESKTOP_UA)) === `302 ${edited}`,
		);
	});
}

async function suiteProjectApi(page: Page, api: APIRequestContext, anon: APIRequestContext): Promise<void> {
	suite("5. Project API and import");
	await guarded("project API", async () => {
		await page.goto(`/projects/${PROJECT.slug}`);
		await page.getByRole("button", { name: "Gerar token da API" }).click();
		const token = (await page.locator("code", { hasText: /^la_/ }).textContent()) ?? "";
		assert("token is shown once after generation", token.startsWith("la_") && token.length > 30);
		const auth = { Authorization: `Bearer ${token}` };
		const before = (await ownLinks(api)).length;

		const created = await anon.post("/api/v1/links", {
			headers: auth,
			data: { externalId: `${PROJECT.baseUrl}/produto/api`, links: [{ url: "https://amzn.to/qa" }] },
		});
		assert("valid payload creates the product", created.status() === 201, `status ${created.status()}`);
		const row = (await ownLinks(api)).find((l) => l.externalId.endsWith("/produto/api"));
		assert("store is detected from the URL", row?.store === "amazon");

		const again = await anon.post("/api/v1/links", {
			headers: auth,
			data: { externalId: `${PROJECT.baseUrl}/produto/api`, links: [{ url: "https://amzn.to/qa" }] },
		});
		assert(
			"repeating the call is idempotent",
			again.status() === 201 && (await ownLinks(api)).length === before + 1,
		);

		const bad = await anon.post("/api/v1/links", { headers: auth, data: { externalId: "", links: "nope" } });
		assert("invalid body is 400", bad.status() === 400, `status ${bad.status()}`);
		const notJson = await anon.post("/api/v1/links", {
			headers: { ...auth, "Content-Type": "application/json" },
			data: "{oops",
		});
		assert("malformed JSON is 400", notJson.status() === 400, `status ${notJson.status()}`);
		const unsafe = await anon.post("/api/v1/links", {
			headers: auth,
			data: { externalId: `${PROJECT.baseUrl}/produto/x`, links: [{ url: "javascript:alert(1)" }] },
		});
		assert("javascript: URL is 400", unsafe.status() === 400, `status ${unsafe.status()}`);
		const foreign = await anon.post("/api/v1/links", {
			headers: auth,
			data: { externalId: "https://other.example.org/p", links: [{ url: "https://amzn.to/qa2" }] },
		});
		assert(
			"product page outside the project domain is refused",
			foreign.status() === 207,
			`status ${foreign.status()}`,
		);
	});

	await guarded("import", async () => {
		await page.goto(`/projects/${PROJECT.slug}`);
		await page.getByRole("button", { name: "Importar JSON/CSV" }).click();
		const csv = `externalId,url,name\n${PROJECT.baseUrl}/produto/csv,https://s.shopee.com.br/qa,"Fone, CSV"\n`;
		await page.getByLabel("Conteúdo JSON ou CSV").fill(csv);
		await page.getByRole("button", { name: "Importar", exact: true }).click();
		await page.getByText("1 produto(s) e 1 link(s) importados, 0 erro(s)").waitFor();
		const row = (await ownLinks(api)).find((l) => l.externalId.endsWith("/produto/csv"));
		assert(
			"CSV import creates the product with a quoted name",
			row?.productName === "Fone, CSV",
			`name=${row?.productName}`,
		);
	});
}

async function suiteTable(page: Page, api: APIRequestContext): Promise<void> {
	suite("6. Links table: filters, sorting, bulk actions, pagination");
	const count = (n: number) => page.getByText(`${n} links`, { exact: true });
	async function choose(label: string, option: string): Promise<void> {
		await page.getByRole("combobox", { name: label }).click();
		await page.getByRole("option", { name: option, exact: true }).click();
	}
	const firstProduct = async (): Promise<string> => (await page.locator("tbody tr a").first().textContent()) ?? "";

	await guarded("filters", async () => {
		await page.goto(`/projects/${PROJECT.slug}`);
		const total = (await ownLinks(api)).length;
		await count(total).waitFor();
		await choose("Status", "Morto");
		await count(1).waitFor();
		assert("status filter keeps only dead links", (await firstProduct()) === XSS_NAME);
		await choose("Status", "Todo status");
		await count(total).waitFor();
		await choose("Loja", "amazon");
		await count(1).waitFor();
		record("PASS", "store filter keeps only that store", "");
		await choose("Loja", "Toda loja");
		await count(total).waitFor();
		record("PASS", "clearing a filter restores the full list", "");
	});

	await guarded("sorting", async () => {
		const names = (await ownLinks(api)).map((l) => l.productName).sort((a, b) => a.localeCompare(b));
		const header = page.getByRole("columnheader", { name: /Produto/ });
		await header.getByRole("button").click();
		assert("first click sorts descending", (await header.getAttribute("aria-sort")) === "descending");
		assert(
			"descending order puts the last name first",
			(await firstProduct()) === names.at(-1),
			await firstProduct(),
		);
		await header.getByRole("button").click();
		assert("second click sorts ascending", (await header.getAttribute("aria-sort")) === "ascending");
		assert("ascending order puts the first name first", (await firstProduct()) === names[0], await firstProduct());
	});

	await guarded("bulk actions", async () => {
		const total = (await ownLinks(api)).length;
		await page.getByRole("checkbox", { name: "Selecionar página" }).check();
		await page.getByText(`${total} selecionados`).waitFor();
		record("PASS", "select-all selects every visible row", "");
		await page.getByRole("checkbox", { name: "Selecionar página" }).uncheck();
		assert("unchecking clears the selection", (await page.getByText("selecionados").count()) === 0);

		const search = page.getByRole("searchbox", { name: "Buscar links" });
		await search.fill(".invalid");
		await count(2).waitFor();
		await page.getByRole("checkbox", { name: "Selecionar página" }).check();
		await page.getByRole("button", { name: "Checar", exact: true }).click();
		await page.getByText("2 checados: 0 ok, 2 falhas, 0 inconclusivos").waitFor({ timeout: 30_000 });
		record("PASS", "bulk health check runs on the selected links only", "");

		await search.fill("amzn.to");
		await count(1).waitFor();
		await page.getByRole("checkbox", { name: "Selecionar página" }).check();
		await page.getByRole("button", { name: "Excluir", exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Excluir", exact: true }).click();
		await page.getByText("Links excluídos").waitFor();
		assert("bulk delete removes the selected link", (await ownLinks(api)).length === total - 1);
	});

	await guarded("pagination", async () => {
		const all = ((await (await api.get("/api/links")).json()) as LinkRow[]).length;
		if (all <= 50) {
			record("SKIP", "pagination", `needs more than 50 links, found ${all} (run db:seed)`);
			return;
		}
		const pages = Math.ceil(all / 50);
		await page.goto("/links");
		await page.getByText(`1 / ${pages}`).waitFor();
		assert("a page shows 50 rows", (await page.locator("tbody tr").count()) === 50);
		const before = await firstProduct();
		assert(
			"Anterior is disabled on the first page",
			await page.getByRole("button", { name: "Anterior" }).isDisabled(),
		);
		await page.getByRole("button", { name: "Próxima" }).click();
		await page.getByText(`2 / ${pages}`).waitFor();
		assert("the next page shows different rows", (await firstProduct()) !== before);
		await page.getByRole("searchbox", { name: "Buscar links" }).fill(PROJECT.slug);
		await page.getByText(`${(await ownLinks(api)).length} links`, { exact: true }).waitFor();
		assert("filtering goes back to the first page", (await page.locator("tbody tr").count()) > 0);
	});
}

async function suiteLayout(context: BrowserContext, baseUrl: string): Promise<void> {
	suite("7. Layout: mobile width and color scheme");
	const browser = context.browser();
	if (!browser) return record("SKIP", "layout", "no browser handle");
	const storageState = await context.storageState();
	const paths = ["/", "/links", "/projects", `/projects/${PROJECT.slug}`];

	await guarded("mobile width", async () => {
		const mobile = await browser.newContext({
			baseURL: baseUrl,
			storageState,
			viewport: { width: 390, height: 800 },
		});
		const page = await mobile.newPage();
		for (const path of paths) {
			await page.goto(path);
			await page.getByRole("button", { name: "Menu" }).waitFor();
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
			assert(`${path} has no horizontal page scroll at 390px`, overflow <= 0, `overflows by ${overflow}px`);
		}
		const nav = page.getByRole("navigation", { name: "Principal" });
		assert("main nav is collapsed at 390px", !(await nav.isVisible()));
		await page.getByRole("button", { name: "Menu" }).click();
		assert("hamburger opens the main nav", await nav.isVisible());
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		const top = await page.locator("header").evaluate((el) => el.getBoundingClientRect().top);
		assert("navbar stays at the top after scrolling", top === 0, `top=${top}`);
		await mobile.close();
	});

	await guarded("color scheme", async () => {
		// Light OS preference on purpose: dark must be the default regardless of it.
		const themed = await browser.newContext({ baseURL: baseUrl, storageState, colorScheme: "light" });
		const page = await themed.newPage();
		const scheme = (): Promise<string> =>
			page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
		const background = (): Promise<string> => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		await page.goto("/links");
		const dark = await background();
		assert("dark is the default theme", (await scheme()) === "dark", await scheme());
		await page.getByRole("button", { name: "Alternar tema" }).click();
		assert("theme toggle switches to light", (await scheme()) === "light" && (await background()) !== dark);
		await page.reload();
		assert("chosen theme survives a reload", (await scheme()) === "light", await scheme());
		await themed.close();
	});
}

async function suiteCleanup(page: Page, api: APIRequestContext, anon: APIRequestContext): Promise<void> {
	suite("8. Deletion and cleanup");
	await guarded("delete link and project", async () => {
		const before = await ownLinks(api);
		await page.goto(`/links/${before[0]?.id}`);
		await page.getByRole("button", { name: "Excluir", exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Excluir", exact: true }).click();
		await page.waitForURL("**/links");
		assert(
			"deleting a link needs a confirmation and removes it",
			(await ownLinks(api)).length === before.length - 1,
		);

		await page.goto(`/projects/${PROJECT.slug}`);
		await page.getByRole("button", { name: "Excluir projeto" }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Excluir projeto" }).click();
		await page.waitForURL("**/projects");
		assert("deleting the project removes its links", (await ownLinks(api)).length === 0);
		assert(
			"its redirect stops resolving",
			(await anon.get(`/link?id=${encodeURIComponent(PRODUCT_ID)}`, { maxRedirects: 0 })).status() === 404,
		);
	});
}

async function suiteAuth(
	context: BrowserContext,
	anon: APIRequestContext,
	email: string,
	password: string,
): Promise<void> {
	suite("10. Auth");
	await guarded("session and logout", async () => {
		const cookie = (await context.cookies()).find((c) => c.name.includes("session_token"));
		assert("session cookie is HttpOnly", cookie?.httpOnly === true, `cookie=${cookie?.name}`);
		assert(
			"session cookie is SameSite=Lax or stricter",
			cookie?.sameSite === "Lax" || cookie?.sameSite === "Strict",
		);
		const page = await context.newPage();
		await page.goto("/");
		await page.getByRole("button", { name: "Sair" }).click();
		await page.waitForURL("**/login");
		const res = await context.request.get("/api/links");
		assert("API is closed again after logout", res.status() === 401, `status ${res.status()}`);
		await page.close();
	});

	// Last on purpose: these attempts trip the sign-in rate limit.
	await guarded("credential attacks", async () => {
		const statuses: number[] = [];
		for (const payload of [...SQLI_PAYLOADS, "wrong-password", "wrong-password-2", "wrong-password-3"]) {
			const res = await anon.post("/api/auth/sign-in/email", { data: { email, password: payload } });
			statuses.push(res.status());
		}
		assert(
			"no wrong password or SQL injection payload logs in",
			statuses.every((s) => s >= 400),
			statuses.join(","),
		);
		assert("repeated attempts hit the rate limit (429)", statuses.includes(429), statuses.join(","));
		const sqliEmail = await anon.post("/api/auth/sign-in/email", { data: { email: "' OR 1=1 --", password } });
		assert(
			"SQL injection in the e-mail field is rejected",
			sqliEmail.status() >= 400,
			`status ${sqliEmail.status()}`,
		);
	});
}

async function main(): Promise<void> {
	const { baseUrl, flags } = parseArgs(process.argv.slice(2));
	const host = new URL(baseUrl).hostname;
	if (!["localhost", "127.0.0.1"].includes(host) && !flags.has("allow-remote"))
		throw new Error(
			`Refusing to run against ${host}: this QA writes and deletes data. Pass --allow-remote for a staging host.`,
		);
	const email = flags.get("admin-email") ?? process.env.ADMIN_EMAIL ?? "admin@example.com";
	const password = flags.get("admin-password") ?? process.env.ADMIN_PASSWORD ?? "";
	console.log(`QA against ${baseUrl} as ${email}`);

	const browser = await chromium.launch({ headless: !flags.has("headed") });
	const context = await browser.newContext({ baseURL: baseUrl });
	context.setDefaultTimeout(15_000);
	const anon = await playwrightRequest.newContext({ baseURL: baseUrl, extraHTTPHeaders: { Origin: baseUrl } });
	const page = await context.newPage();
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	try {
		await suitePublicSurface(anon);
		await suiteAuthorization(anon);

		suite("0. Setup — admin login");
		await login(page, email, password);
		const loggedIn = await page
			.getByRole("heading", { name: "Visão geral" })
			.waitFor()
			.then(() => true)
			.catch(() => false);
		if (
			assert(
				"admin logs in through the UI",
				loggedIn,
				"check --admin-email/--admin-password and `bun run db:seed`",
			)
		) {
			// Presence only: clicking it would probe every real store URL in the database.
			assert(
				"overview offers checking every link at once",
				await page.getByRole("button", { name: "Checar todos os links" }).isVisible(),
			);
			await suiteCrud(page, context.request);
			await suiteRedirect(page, context.request, anon);
			await suiteProjectApi(page, context.request, anon);
			await suiteTable(page, context.request);
			await suiteLayout(context, baseUrl);
			await suiteCleanup(page, context.request, anon);
			suite("9. Robustness");
			assert(
				"unknown link id renders a 404 page",
				(await context.request.get("/links/does-not-exist")).status() === 404,
			);
			assert(
				"no uncaught browser errors during the run",
				pageErrors.length === 0,
				pageErrors.slice(0, 3).join(" | "),
			);
			await suiteAuth(context, anon, email, password);
		}
	} finally {
		await browser.close();
		await anon.dispose();
	}

	const count = (status: Status): number => checks.filter((c) => c.status === status).length;
	console.log(`\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("SKIP")} skipped`);
	for (const c of checks.filter((c) => c.status === "FAIL"))
		console.log(`  FAIL [${c.suite}] ${c.name} — ${c.reason}`);
	const report = flags.get("report");
	if (report) writeFileSync(report, JSON.stringify({ baseUrl, ranAt: new Date().toISOString(), checks }, null, "\t"));
	if (count("FAIL") > 0) process.exit(1);
}

await main();
