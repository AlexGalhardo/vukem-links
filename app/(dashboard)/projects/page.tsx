import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NewProjectDialog } from "@/components/project-tools";
import { fmt } from "@/components/stats";
import { projects } from "@/db/schema";
import { listLinks } from "@/lib/data";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjectsPage(): Promise<ReactNode> {
	await requireSession();
	const [all, links] = await Promise.all([db.select().from(projects).orderBy(projects.name), listLinks()]);

	return (
		<>
			<div className="flex items-center justify-between">
				<h1 className="text-base font-semibold">Projetos</h1>
				<NewProjectDialog />
			</div>
			{all.length === 0 ? (
				<p className="rounded-lg border border-line bg-panel p-4 text-muted">
					Nenhum projeto ainda. Crie um para começar a cadastrar links.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-line bg-panel">
					<table className="w-full text-left">
						<thead className="border-b border-line text-xs text-muted">
							<tr>
								<th className="px-3 py-1.5 font-medium">Projeto</th>
								<th className="px-3 py-1.5 font-medium">URL base</th>
								<th className="px-3 py-1.5 text-right font-medium">Produtos</th>
								<th className="px-3 py-1.5 text-right font-medium">Links</th>
								<th className="px-3 py-1.5 text-right font-medium">Mortos</th>
								<th className="px-3 py-1.5 text-right font-medium">Cliques</th>
							</tr>
						</thead>
						<tbody>
							{all.map((project) => {
								const own = links.filter((l) => l.projectSlug === project.slug);
								const dead = own.filter((l) => l.status === "dead").length;
								return (
									<tr
										key={project.id}
										className="border-b border-line last:border-0 hover:bg-raised/60"
									>
										<td className="px-3 py-1.5">
											<Link
												href={`/projects/${project.slug}`}
												className="font-medium hover:text-accent"
											>
												{project.name}
											</Link>
										</td>
										<td className="px-3 py-1.5 font-mono text-xs text-muted">{project.baseUrl}</td>
										<td className="px-3 py-1.5 text-right">
											{fmt(new Set(own.map((l) => l.productId)).size)}
										</td>
										<td className="px-3 py-1.5 text-right">{fmt(own.length)}</td>
										<td className={`px-3 py-1.5 text-right ${dead ? "text-bad" : "text-muted"}`}>
											{fmt(dead)}
										</td>
										<td className="px-3 py-1.5 text-right font-medium">
											{fmt(own.reduce((sum, l) => sum + l.clicks, 0))}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
