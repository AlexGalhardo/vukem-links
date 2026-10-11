import Link from "next/link";
import type { ReactNode } from "react";
import { CheckAllLinks } from "@/components/link-actions";
import { ClickMetrics, fmt, Metric, Panel, StatsPanels, StatusBadge } from "@/components/stats";
import { getStats, type LinkRow, listLinks } from "@/lib/data";
import { requireSession } from "@/lib/session";

function LinkList({ links, empty }: { links: LinkRow[]; empty: string }): ReactNode {
	if (links.length === 0) return <p className="p-3 text-muted">{empty}</p>;
	return (
		<ul>
			{links.map((l) => (
				<li key={l.id} className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-0">
					<Link href={`/links/${l.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
						{l.productName}
					</Link>
					<span className="hidden text-muted sm:inline">{l.projectName}</span>
					<span className="hidden text-muted sm:inline">{l.store}</span>
					<StatusBadge status={l.status} />
					<span className="w-14 text-right font-medium">{fmt(l.clicks)}</span>
				</li>
			))}
		</ul>
	);
}

export default async function OverviewPage(): Promise<ReactNode> {
	await requireSession();
	const [stats, links] = await Promise.all([getStats(), listLinks()]);
	const dead = links.filter((l) => l.status === "dead");
	const unchecked = links.filter((l) => l.status === "unknown").length;
	const top = [...links].sort((a, b) => b.clicks - a.clicks).slice(0, 10);

	return (
		<>
			<h1 className="text-base font-semibold">Visão geral</h1>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Metric label="Links" value={fmt(links.length)} hint={`${fmt(unchecked)} não checados`} />
				<Metric label="Links mortos" value={fmt(dead.length)} tone={dead.length ? "text-bad" : "text-ok"} />
				<ClickMetrics stats={stats} />
			</div>
			<StatsPanels stats={stats} />
			<div className="grid gap-3 lg:grid-cols-2">
				<Panel title="Links mortos">
					<CheckAllLinks total={links.length} />
					<LinkList links={dead.slice(0, 10)} empty="Nenhum link morto." />
				</Panel>
				<Panel title="Mais clicados">
					<LinkList links={top} empty="Nenhum link cadastrado." />
				</Panel>
			</div>
		</>
	);
}
