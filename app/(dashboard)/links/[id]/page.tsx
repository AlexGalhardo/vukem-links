import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LinkActions } from "@/components/link-actions";
import { ClickMetrics, Panel, StatsPanels, StatusBadge } from "@/components/stats";
import { getLinkDetail, getStats } from "@/lib/data";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Link" };

const RESULT: Record<string, string> = { ok: "OK", failed: "Falha", inconclusive: "Inconclusivo" };
const RESULT_TONE: Record<string, string> = { ok: "text-ok", failed: "text-bad", inconclusive: "text-warn" };
const dateTime = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "America/Sao_Paulo",
});

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
	await requireSession();
	const { id } = await params;
	const detail = await getLinkDetail(id);
	// A link that does not exist (or was removed) goes back to the start page, like any unknown address.
	if (!detail) redirect("/");
	const { link, product, project, siblings, checks } = detail;
	const stats = await getStats({ linkId: id });

	return (
		<>
			<div className="flex flex-wrap items-start gap-3">
				<div className="min-w-0 flex-1">
					<p className="text-muted">
						<Link href={`/projects/${project.slug}`} className="hover:text-accent">
							{project.name}
						</Link>
						{product.category && ` · ${product.category}`} · {link.store}
					</p>
					<h1 className="truncate text-base font-semibold">{product.name}</h1>
					<a
						href={link.url}
						target="_blank"
						rel="noreferrer nofollow"
						className="block truncate font-mono text-xs text-accent hover:underline"
					>
						{link.url}
					</a>
				</div>
				<LinkActions id={link.id} url={link.url} priority={link.priority} externalId={product.externalId} />
			</div>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<ClickMetrics stats={stats} />
			</div>

			<div className="grid gap-3 lg:grid-cols-2">
				<Panel title="Onde está">
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-3">
						<dt className="text-muted">Status</dt>
						<dd>
							<StatusBadge status={link.status} />
							{link.consecutiveFailures > 0 && (
								<span className="text-muted"> · {link.consecutiveFailures} falha(s) seguidas</span>
							)}
						</dd>
						<dt className="text-muted">Projeto</dt>
						<dd>{project.name}</dd>
						<dt className="text-muted">Página</dt>
						<dd className="min-w-0">
							<a
								href={product.pageUrl}
								target="_blank"
								rel="noreferrer"
								className="block truncate text-accent hover:underline"
							>
								{product.pageUrl}
							</a>
						</dd>
						<dt className="text-muted">ID</dt>
						<dd className="truncate font-mono text-xs">{product.externalId}</dd>
						<dt className="text-muted">Destino final</dt>
						<dd className="truncate font-mono text-xs">{link.finalUrl ?? "—"}</dd>
					</dl>
				</Panel>
				<Panel title="Ordem de fallback do produto">
					<ol>
						{siblings.map((s, i) => (
							<li
								key={s.id}
								className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-0"
							>
								<span className="w-4 text-muted">{i + 1}</span>
								<Link
									href={`/links/${s.id}`}
									aria-current={s.id === link.id ? "page" : undefined}
									className={`min-w-0 flex-1 truncate font-mono text-xs hover:text-accent ${s.id === link.id ? "font-semibold" : ""}`}
								>
									{s.url}
								</Link>
								<span className="text-muted">{s.store}</span>
								<StatusBadge status={s.status} />
							</li>
						))}
					</ol>
				</Panel>
			</div>

			<StatsPanels stats={stats} />

			<Panel title="Histórico de checagens">
				{checks.length === 0 ? (
					<p className="p-3 text-muted">Nunca checado.</p>
				) : (
					<table className="w-full text-left">
						<thead className="border-b border-line text-xs text-muted">
							<tr>
								<th className="px-3 py-1.5 font-medium">Quando</th>
								<th className="px-3 py-1.5 font-medium">Resultado</th>
								<th className="px-3 py-1.5 font-medium">HTTP</th>
								<th className="px-3 py-1.5 font-medium">Destino final</th>
							</tr>
						</thead>
						<tbody>
							{checks.map((c) => (
								<tr key={c.id} className="border-b border-line last:border-0">
									<td className="px-3 py-1 whitespace-nowrap">{dateTime.format(c.checkedAt)}</td>
									<td className={`px-3 py-1 ${RESULT_TONE[c.result] ?? ""}`}>
										{RESULT[c.result] ?? c.result}
									</td>
									<td className="px-3 py-1">{c.statusCode ?? "—"}</td>
									<td className="max-w-md truncate px-3 py-1 font-mono text-xs">
										{c.finalUrl ?? "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Panel>
		</>
	);
}
