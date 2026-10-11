import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "@/db/schema";
import { hashToken, upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { productInput } from "@/lib/links";

const body = z.union([productInput, z.array(productInput).min(1).max(500)]);

// Lets a project register its own products/links: `Authorization: Bearer <project token>`. See docs/api.md.
export async function POST(request: Request): Promise<Response> {
	const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
	// Lookup by SHA-256 of a 192-bit random token: no timing oracle worth exploiting.
	const [project] = token
		? await db
				.select()
				.from(projects)
				.where(eq(projects.apiTokenHash, hashToken(token)))
		: [];
	if (!project) return Response.json({ error: "unauthorized" }, { status: 401 });

	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

	const summary = await upsertProducts(project, [parsed.data].flat());
	return Response.json(summary, { status: summary.errors.length ? 207 : 201 });
}
