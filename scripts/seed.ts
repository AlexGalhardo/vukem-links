// Idempotent local bootstrap: admin account + the produtostech project loaded from seed.json.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { upsertProducts } from "@/lib/data";
import { db } from "@/lib/db";
import { parseImport } from "@/lib/links";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 8)
	throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars) in .env");

// Sign-up is disabled in lib/auth.ts, so the admin is written through better-auth's internal adapter.
const ctx = await auth.$context;
if (await ctx.internalAdapter.findUserByEmail(email)) {
	console.log(`Admin ${email} already exists.`);
} else {
	const user = await ctx.internalAdapter.createUser(
		{ email, name: "Admin", emailVerified: true },
		{ method: "admin" },
	);
	await ctx.internalAdapter.linkAccount({
		userId: user.id,
		providerId: "credential",
		accountId: user.id,
		password: await ctx.password.hash(password),
	});
	console.log(`Admin ${email} created.`);
}

const slug = "produtostech";
let [project] = await db.select().from(projects).where(eq(projects.slug, slug));
if (!project)
	[project] = await db
		.insert(projects)
		.values({ name: "Produtos Tech", slug, baseUrl: "https://app.produtostech.com.br" })
		.returning();
if (!project) throw new Error("Could not create the seed project");

const summary = await upsertProducts(project, parseImport(readFileSync("seed.json", "utf8")));
console.log(`Seed: ${summary.productsCreated} products, ${summary.linksAdded} links, ${summary.errors.length} errors.`);
for (const error of summary.errors.slice(0, 10)) console.log(`  - ${error}`);
