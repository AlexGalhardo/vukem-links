"use server";

import { eq, inArray, min } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { affiliateLinks, projects } from "@/db/schema";
import { rotateApiToken, type UpsertSummary, upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { type CheckSummary, checkLinks } from "@/lib/health";
import { detectStore, isPublicHttpUrl, parseImport, productInput } from "@/lib/links";
import { requireSession } from "@/lib/session";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ids = z.array(z.string().min(1)).min(1).max(500);
const url = z.string().trim().refine(isPublicHttpUrl, "URL http(s) pública obrigatória");

function fail(error: unknown): { ok: false; error: string } {
	if (error instanceof z.ZodError) return { ok: false, error: error.issues.map((i) => i.message).join("; ") };
	if (error instanceof SyntaxError) return { ok: false, error: "JSON inválido" };
	// Next signals redirects by throwing: let requireSession's redirect through.
	if (error instanceof Error && "digest" in error) throw error;
	console.error(error);
	return { ok: false, error: "Erro inesperado. Veja o log do servidor." };
}

async function findProject(id: string): Promise<typeof projects.$inferSelect> {
	const [project] = await db.select().from(projects).where(eq(projects.id, id));
	if (!project) throw new z.ZodError([{ code: "custom", message: "Projeto não encontrado", path: [], input: id }]);
	return project;
}

const projectInput = z.object({
	name: z.string().trim().min(1).max(80),
	slug: z
		.string()
		.trim()
		.regex(/^[a-z0-9-]{1,40}$/, "Slug: apenas a-z, 0-9 e hífen"),
	baseUrl: url.transform((u) => new URL(u).origin),
});

export async function createProject(input: unknown): Promise<Result> {
	try {
		await requireSession();
		const data = projectInput.parse(input);
		const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, data.slug));
		if (existing) return { ok: false, error: "Já existe um projeto com esse slug" };
		await db.insert(projects).values(data);
		revalidatePath("/", "layout");
		return { ok: true };
	} catch (error) {
		return fail(error);
	}
}

export async function deleteProject(id: string): Promise<Result> {
	try {
		await requireSession();
		await db.delete(projects).where(eq(projects.id, z.string().min(1).parse(id)));
		revalidatePath("/", "layout");
		return { ok: true };
	} catch (error) {
		return fail(error);
	}
}

export async function saveProduct(projectId: string, input: unknown): Promise<Result<{ summary: UpsertSummary }>> {
	try {
		await requireSession();
		const summary = await upsertProducts(await findProject(projectId), [productInput.parse(input)]);
		if (summary.errors[0]) return { ok: false, error: summary.errors[0] };
		revalidatePath("/", "layout");
		return { ok: true, summary };
	} catch (error) {
		return fail(error);
	}
}

export async function importProducts(projectId: string, text: string): Promise<Result<{ summary: UpsertSummary }>> {
	try {
		await requireSession();
		const summary = await upsertProducts(await findProject(projectId), parseImport(text));
		revalidatePath("/", "layout");
		return { ok: true, summary };
	} catch (error) {
		return fail(error);
	}
}

const linkPatch = z.object({ url, priority: z.coerce.number().int().min(-9999).max(9999) });

export async function updateLink(id: string, input: unknown): Promise<Result> {
	try {
		await requireSession();
		const data = linkPatch.parse(input);
		const [current] = await db.select().from(affiliateLinks).where(eq(affiliateLinks.id, id));
		if (!current) return { ok: false, error: "Link não encontrado" };
		// A new destination has never been checked: its health starts over.
		const reset =
			data.url === current.url
				? {}
				: {
						store: detectStore(data.url),
						status: "unknown" as const,
						consecutiveFailures: 0,
						lastCheckedAt: null,
					};
		await db
			.update(affiliateLinks)
			.set({ ...data, ...reset })
			.where(eq(affiliateLinks.id, id));
		revalidatePath("/", "layout");
		return { ok: true };
	} catch (error) {
		return fail(error);
	}
}

/** Makes the link the first choice of its product. */
export async function promoteLink(id: string): Promise<Result> {
	try {
		await requireSession();
		const [link] = await db.select().from(affiliateLinks).where(eq(affiliateLinks.id, id));
		if (!link) return { ok: false, error: "Link não encontrado" };
		const [top] = await db
			.select({ value: min(affiliateLinks.priority) })
			.from(affiliateLinks)
			.where(eq(affiliateLinks.productId, link.productId));
		await db
			.update(affiliateLinks)
			.set({ priority: (top?.value ?? 0) - 1 })
			.where(eq(affiliateLinks.id, id));
		revalidatePath("/", "layout");
		return { ok: true };
	} catch (error) {
		return fail(error);
	}
}

export async function deleteLinks(linkIds: string[]): Promise<Result> {
	try {
		await requireSession();
		await db.delete(affiliateLinks).where(inArray(affiliateLinks.id, ids.parse(linkIds)));
		revalidatePath("/", "layout");
		return { ok: true };
	} catch (error) {
		return fail(error);
	}
}

/** Without ids: checks the next batch of least recently checked links. */
export async function runHealthCheck(linkIds?: string[]): Promise<Result<{ summary: CheckSummary }>> {
	try {
		await requireSession();
		const summary = await checkLinks(linkIds ? ids.parse(linkIds) : undefined);
		revalidatePath("/", "layout");
		return { ok: true, summary };
	} catch (error) {
		return fail(error);
	}
}

export async function rotateToken(projectId: string): Promise<Result<{ token: string }>> {
	try {
		await requireSession();
		const project = await findProject(projectId);
		return { ok: true, token: await rotateApiToken(project.id) };
	} catch (error) {
		return fail(error);
	}
}
