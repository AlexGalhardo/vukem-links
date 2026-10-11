import { z } from "zod";
import type { Project } from "@/db/schema";
import { hasBearer } from "@/lib/cron";
import { findOrCreateProject, syncProducts, upsertProducts } from "@/lib/data";
import { isSiteLive } from "@/lib/health";
import { isPublicHttpUrl, productInput } from "@/lib/links";

// A full sync of a large catalogue is hundreds of statements against Turso.
export const maxDuration = 60;

const appendBody = z.union([productInput, z.array(productInput).min(1).max(500)]);
const syncBody = z
	.array(productInput)
	.min(1)
	.max(5000)
	.refine((items) => new Set(items.map((item) => item.externalId)).size === items.length, "externalId repetido");

/**
 * Every site uses the same key (`Authorization: Bearer $LINKS_API_KEY`) and names itself with `?site=<origin>`.
 * A site seen for the first time becomes a project, so connecting one needs no step in the dashboard. See docs/api.md.
 */
async function authorize<T>(request: Request, schema: z.ZodType<T>): Promise<Response | { project: Project; data: T }> {
	if (!hasBearer(request, process.env.LINKS_API_KEY))
		return Response.json({ error: "unauthorized" }, { status: 401 });

	const site = new URL(request.url).searchParams.get("site") ?? "";
	if (!isPublicHttpUrl(site)) return Response.json({ error: "invalid_site" }, { status: 400 });
	const baseUrl = new URL(site).origin;

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

	// Links are only accepted for a site that is actually online.
	if (!(await isSiteLive(baseUrl))) return Response.json({ error: "project_offline", baseUrl }, { status: 409 });
	return { project: await findOrCreateProject(baseUrl), data: parsed.data };
}

// Appends products/links to the site's project. Never removes anything.
export async function POST(request: Request): Promise<Response> {
	const auth = await authorize(request, appendBody);
	if (auth instanceof Response) return auth;
	const summary = await upsertProducts(auth.project, [auth.data].flat());
	return Response.json(summary, { status: summary.errors.length ? 207 : 201 });
}

// Full sync: the body is the site's whole catalogue. Whatever is missing from it is removed.
export async function PUT(request: Request): Promise<Response> {
	const auth = await authorize(request, syncBody);
	if (auth instanceof Response) return auth;
	const summary = await syncProducts(auth.project, auth.data);
	return Response.json(summary, { status: summary.errors.length ? 207 : 200 });
}
