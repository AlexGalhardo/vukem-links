import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LinksTable } from "@/components/links-table";
import { ProjectTools } from "@/components/project-tools";
import { ClickMetrics, StatsPanels } from "@/components/stats";
import { projects } from "@/db/schema";
import { getStats } from "@/lib/data";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Projeto" };

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }): Promise<ReactNode> {
	await requireSession();
	const { slug } = await params;
	const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
	// A project that does not exist (or was removed) goes back to the start page, like any unknown address.
	if (!project) redirect("/");
	const stats = await getStats({ projectId: project.id });

	return (
		<>
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<h1 className="text-base font-semibold">{project.name}</h1>
					<a
						href={project.baseUrl}
						target="_blank"
						rel="noreferrer"
						className="font-mono text-xs text-accent hover:underline"
					>
						{project.baseUrl}
					</a>
				</div>
				<ProjectTools id={project.id} name={project.name} />
			</div>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<ClickMetrics stats={stats} />
			</div>
			<LinksTable
				projects={[{ id: project.id, slug: project.slug, name: project.name }]}
				projectSlug={project.slug}
			/>
			<StatsPanels stats={stats} />
		</>
	);
}
