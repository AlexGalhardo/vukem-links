import { mock } from "bun:test";
import { type Project, projects } from "@/db/schema";
import { db } from "@/lib/db";

let counter = 0;

/** Every test gets its own project, so tests sharing the database file never see each other's rows. */
export async function createProject(): Promise<Project> {
	const slug = `p${++counter}-${crypto.randomUUID().slice(0, 8)}`;
	const [project] = await db
		.insert(projects)
		.values({ name: slug, slug, baseUrl: `https://${slug}.example.com` })
		.returning();
	if (!project) throw new Error("project not created");
	return project;
}

export interface TelegramCall {
	text: string;
}

/**
 * Replaces global fetch. `respond` answers store URLs (return a status, or throw to simulate a network error);
 * calls to the Telegram API are captured instead. Returns the captured calls and a restore function.
 */
export function mockFetch(respond: (url: string) => { status: number; finalUrl?: string }): {
	telegram: TelegramCall[];
	restore: () => void;
} {
	const original = globalThis.fetch;
	const telegram: TelegramCall[] = [];
	globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.startsWith("https://api.telegram.org/")) {
			telegram.push(JSON.parse(String(init?.body)) as TelegramCall);
			return new Response("{}", { status: 200 });
		}
		const { status, finalUrl } = respond(url);
		const response = new Response(null, { status });
		Object.defineProperty(response, "url", { value: finalUrl ?? url });
		return response;
	}) as unknown as typeof fetch;
	return {
		telegram,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}
