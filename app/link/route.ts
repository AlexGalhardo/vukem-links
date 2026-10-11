import { asc, eq } from "drizzle-orm";
import { after, type NextRequest, NextResponse, userAgent } from "next/server";
import { affiliateLinks, clickEvents, products } from "@/db/schema";
import { db } from "@/lib/db";
import { pickLink, toDevice } from "@/lib/links";
import { notify } from "@/lib/telegram";

// Public affiliate redirect: /link?id=<product externalId>[&store=<store>]. URL shape is frozen, projects already link to it.
export async function GET(request: NextRequest): Promise<Response> {
	const externalId = request.nextUrl.searchParams.get("id");
	const [product] = externalId ? await db.select().from(products).where(eq(products.externalId, externalId)) : [];
	if (!product) return new Response("Link não encontrado", { status: 404 });

	const links = await db
		.select()
		.from(affiliateLinks)
		.where(eq(affiliateLinks.productId, product.id))
		.orderBy(asc(affiliateLinks.priority));
	// Optional: a page with one button per store asks for that store. Unknown stores fall back to the priority order.
	const link = pickLink(links, request.nextUrl.searchParams.get("store") ?? undefined);

	const ua = userAgent(request);
	const referer = request.headers.get("referer");
	const event: typeof clickEvents.$inferInsert = {
		productId: product.id,
		linkId: link?.id ?? null,
		device: toDevice(ua.device.type),
		os: ua.os.name ?? null,
		browser: ua.browser.name ?? null,
		country: request.headers.get("x-vercel-ip-country"),
		// Origin + path only: query strings can carry personal data.
		referer: referer && URL.canParse(referer) ? new URL(referer).origin + new URL(referer).pathname : null,
		isBot: ua.isBot,
	};
	// Recorded after the response so tracking never delays (or breaks) the redirect.
	after(async () => {
		await db.insert(clickEvents).values(event);
		if (!link && !ua.isBot) await notify(`⚠️ Clique sem link vivo: ${product.name}\n${product.pageUrl}`);
	});

	return NextResponse.redirect(link?.url ?? product.pageUrl, {
		status: 302,
		headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
	});
}
