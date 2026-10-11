import { eq } from "drizzle-orm";
import { z } from "zod";
import { type Project, projects } from "@/db/schema";
import { hashToken, syncProducts, upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { isSiteLive } from "@/lib/health";
import { productInput } from "@/lib/links";

// A full sync of a large catalogue is hundreds of statements against Turso.
export const maxDuration = 60;

const appendBody = z.union([productInput, z.array(productInput).min(1).max(500)]);
const syncBody = z
	.array(productInput)
	.min(1)
	.max(5000)
	.refine((items) => new Set(items.map((item) => item.externalId)).size === items.length, "externalId repetido");

/** Resolves the project from `Authorization: Bearer <project token>` and validates the body. See docs/api.md. */
async function authorize<T>(request: Request, schema: z.ZodType<T>): Promise<Response | { project: Project; data: T }> {
	const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
	// Lookup by SHA-256 of a 192-bit random token: no timing oracle worth exploiting.
	const [project] = token
		? await db
				.select()
				.from(projects)
				.where(eq(projects.apiTokenHash, hashToken(token)))
		: [];
	if (!project) return Response.json({ error: "unauthorized" }, { status: 401 });

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

	// Links are only accepted for a site that is actually online.
	if (!(await isSiteLive(project.baseUrl)))
		return Response.json({ error: "project_offline", baseUrl: project.baseUrl }, { status: 409 });
	return { project, data: parsed.data };
}

// Appends products/links to the token's project. Never removes anything.
export async function POST(request: Request): Promise<Response> {
	const auth = await authorize(request, appendBody);
	if (auth instanceof Response) return auth;
	const summary = await upsertProducts(auth.project, [auth.data].flat());
	return Response.json(summary, { status: summary.errors.length ? 207 : 201 });
}

// Full sync: the body is the project's whole catalogue. Whatever is missing from it is removed.
export async function PUT(request: Request): Promise<Response> {
	const auth = await authorize(request, syncBody);
	if (auth instanceof Response) return auth;
	const summary = await syncProducts(auth.project, auth.data);
	return Response.json(summary, { status: summary.errors.length ? 207 : 200 });
}
