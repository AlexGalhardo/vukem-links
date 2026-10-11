import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LinksTable } from "@/components/links-table";
import { projects } from "@/db/schema";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage(): Promise<ReactNode> {
	await requireSession();
	const options = await db
		.select({ id: projects.id, slug: projects.slug, name: projects.name })
		.from(projects)
		.orderBy(projects.name);
	return (
		<>
			<h1 className="text-base font-semibold">Links</h1>
			<LinksTable projects={options} />
		</>
	);
}
