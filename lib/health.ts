import { asc, eq, inArray } from "drizzle-orm";
import { affiliateLinks, linkChecks, products } from "@/db/schema";
import { db } from "@/lib/db";
import { classifyProbe, nextHealth, type Probe } from "@/lib/links";
import { notify } from "@/lib/telegram";

const TIMEOUT_MS = 8000;
const CONCURRENCY = 20;
// ponytail: one cron run covers BATCH links (oldest check first), so a full sweep of N links takes
// N/BATCH hours (the cron is hourly). Worst case BATCH/CONCURRENCY*TIMEOUT = 160s, inside the 300s function limit.
// Move to Vercel Queues/Workflows if the catalogue outgrows a few thousand links.
export const BATCH = 400;

// Stores serve bot-looking clients a 403; a browser UA gets the real redirect chain.
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async function probe(url: string): Promise<Probe> {
	try {
		const res = await fetch(url, {
			redirect: "follow",
			headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		await res.body?.cancel();
		return { statusCode: res.status, finalUrl: res.url };
	} catch (error) {
		const name = error instanceof Error ? error.name : "";
		return { timedOut: name === "TimeoutError" || name === "AbortError" };
	}
}

/** A project only receives links while its site answers: any response below 500 proves DNS and server are up. */
export async function isSiteLive(baseUrl: string): Promise<boolean> {
	const { statusCode } = await probe(baseUrl);
	return statusCode !== undefined && statusCode < 500;
}

export interface CheckSummary {
	checked: number;
	ok: number;
	failed: number;
	inconclusive: number;
	/** Links that crossed into `dead` during this run. */
	died: number;
}

/** Checks the given links, or the BATCH least recently checked ones when no ids are passed. */
export async function checkLinks(ids?: string[]): Promise<CheckSummary> {
	const query = db
		.select({ link: affiliateLinks, productName: products.name })
		.from(affiliateLinks)
		.innerJoin(products, eq(products.id, affiliateLinks.productId));
	const rows = ids
		? await query.where(inArray(affiliateLinks.id, ids))
		: await query.orderBy(asc(affiliateLinks.lastCheckedAt)).limit(BATCH);

	const summary: CheckSummary = { checked: 0, ok: 0, failed: 0, inconclusive: 0, died: 0 };
	const died: string[] = [];
	const queue = [...rows];

	async function worker(): Promise<void> {
		for (let row = queue.shift(); row; row = queue.shift()) {
			const { link, productName } = row;
			const result = await probe(link.url);
			const outcome = classifyProbe(link.url, result);
			const health = nextHealth(link, outcome);
			await db.insert(linkChecks).values({
				linkId: link.id,
				statusCode: result.statusCode,
				finalUrl: result.finalUrl,
				result: outcome,
			});
			await db
				.update(affiliateLinks)
				.set({
					...health,
					lastCheckedAt: new Date(),
					lastStatusCode: result.statusCode ?? null,
					finalUrl: result.finalUrl ?? null,
				})
				.where(eq(affiliateLinks.id, link.id));
			summary.checked++;
			summary[outcome]++;
			if (health.status === "dead" && link.status !== "dead")
				died.push(`${productName} (${link.store}): ${link.url}`);
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	summary.died = died.length;
	if (died.length) await notify(`🚨 ${died.length} link(s) de afiliado morto(s):\n\n${died.slice(0, 30).join("\n")}`);
	return summary;
}
