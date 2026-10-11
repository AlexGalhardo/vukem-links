import { describe, expect, test } from "bun:test";
import { ESSENTIAL, envProblems } from "./env";

const valid = {
	TURSO_DATABASE_URL: "libsql://links-prod.example.turso.io",
	TURSO_AUTH_TOKEN: "t".repeat(40),
	BETTER_AUTH_SECRET: "s".repeat(44),
	BETTER_AUTH_URL: "https://links.example.com",
	CRON_SECRET: "c".repeat(64),
	LINKS_API_KEY: "k".repeat(64),
};

describe("envProblems", () => {
	test("a complete, well-formed production environment has no problems", () => {
		expect(envProblems(valid, true)).toEqual([]);
		expect(
			envProblems(
				{
					...valid,
					ADMIN_EMAIL: "dono@example.com",
					ADMIN_PASSWORD: "senha-forte",
					TELEGRAM_BOT_HTTP_TOKEN: `123456789:${"A".repeat(35)}`,
					TELEGRAM_BOT_CHANNEL_ID: "-1001234567890",
					UNRELATED: "x",
				},
				true,
			),
		).toEqual([]);
	});

	test("nothing is required outside production, and a local file database is fine there", () => {
		expect(envProblems({}, false)).toEqual([]);
		expect(envProblems({ TURSO_DATABASE_URL: "file:./local.db" }, false)).toEqual([]);
		expect(envProblems(Object.fromEntries(ESSENTIAL.map((name) => [name, ""])), false)).toEqual([]);
	});

	test("production names every essential variable that is missing or empty", () => {
		expect(envProblems({}, true)).toEqual(
			ESSENTIAL.map((name) => `${name}: obrigatória em produção e não definida`),
		);
		expect(envProblems({ ...valid, LINKS_API_KEY: "" }, true)).toEqual([
			"LINKS_API_KEY: obrigatória em produção e não definida",
		]);
	});

	test("production refuses a local file database", () => {
		expect(envProblems({ ...valid, TURSO_DATABASE_URL: "file:./local.db" }, true)).toEqual([
			"TURSO_DATABASE_URL: produção exige um banco remoto (libsql:// ou https://)",
		]);
	});

	test("a malformed value fails everywhere, without echoing the value", () => {
		const cases: [string, string][] = [
			["TURSO_DATABASE_URL", "postgres://x"],
			["BETTER_AUTH_SECRET", "short"],
			["BETTER_AUTH_URL", "links.example.com"],
			["CRON_SECRET", "short"],
			["LINKS_API_KEY", "short"],
			["ADMIN_EMAIL", "sem-arroba"],
			["ADMIN_PASSWORD", "1234"],
		];
		for (const [name, value] of cases) {
			for (const production of [false, true]) {
				const problems = envProblems({ ...valid, [name]: value }, production);
				expect(problems).toHaveLength(1);
				expect(problems[0]?.startsWith(`${name}: valor inválido`)).toBe(true);
				expect(problems[0]).not.toContain(value);
			}
		}
	});

	test("the Telegram bot needs both variables or none", () => {
		const token = `123456789:${"A".repeat(35)}`;
		expect(envProblems({ TELEGRAM_BOT_HTTP_TOKEN: token }, false)).toHaveLength(1);
		expect(envProblems({ TELEGRAM_BOT_CHANNEL_ID: "-100123" }, false)).toHaveLength(1);
		expect(envProblems({ TELEGRAM_BOT_HTTP_TOKEN: token, TELEGRAM_BOT_CHANNEL_ID: "@canal" }, false)).toEqual([]);
		expect(envProblems({ TELEGRAM_BOT_HTTP_TOKEN: "abc", TELEGRAM_BOT_CHANNEL_ID: "-100123" }, false)).toHaveLength(
			1,
		);
	});
});
