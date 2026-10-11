import type { ReactNode } from "react";
import type { LinkStatus } from "@/db/schema";
import type { Bucket, Stats } from "@/lib/data";

const number = new Intl.NumberFormat("pt-BR");
export const fmt = (n: number): string => number.format(n);

const STATUS: Record<LinkStatus, { label: string; className: string }> = {
	alive: { label: "Vivo", className: "text-ok" },
	dead: { label: "Morto", className: "text-bad" },
	unknown: { label: "Não checado", className: "text-muted" },
};

export function StatusBadge({ status }: { status: LinkStatus }): ReactNode {
	const { label, className } = STATUS[status];
	return (
		<span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
			<span aria-hidden className="size-1.5 rounded-full bg-current" />
			{label}
		</span>
	);
}

export function Panel({
	title,
	children,
	className = "",
}: {
	title?: string;
	children: ReactNode;
	className?: string;
}): ReactNode {
	return (
		<section className={`min-w-0 rounded-lg border border-line bg-panel ${className}`}>
			{title && (
				<h2 className="border-b border-line px-3 py-2 text-xs font-semibold text-muted uppercase">{title}</h2>
			)}
			{children}
		</section>
	);
}

export function Metric({
	label,
	value,
	hint,
	tone = "",
}: {
	label: string;
	value: string;
	hint?: string;
	tone?: string;
}): ReactNode {
	return (
		<div className="rounded-lg border border-line bg-panel px-3 py-2.5">
			<div className="text-xs text-muted">{label}</div>
			<div className={`mt-0.5 text-xl font-semibold ${tone}`}>{value}</div>
			{hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
		</div>
	);
}

function DayChart({ data }: { data: Bucket[] }): ReactNode {
	const max = Math.max(1, ...data.map((d) => d.count));
	const total = data.reduce((sum, d) => sum + d.count, 0);
	return (
		<figure className="p-3">
			<div
				className="flex h-28 items-end gap-px"
				role="img"
				aria-label={`${fmt(total)} cliques nos últimos ${data.length} dias`}
			>
				{data.map((d) => (
					<div
						key={d.key}
						title={`${d.key.split("-").reverse().join("/")}: ${fmt(d.count)}`}
						className="min-h-px flex-1 rounded-t-sm bg-accent/80 hover:bg-accent"
						style={{ height: `${(d.count / max) * 100}%` }}
					/>
				))}
			</div>
			<figcaption className="mt-1.5 flex justify-between text-xs text-muted">
				<span>{data[0]?.key.slice(5).split("-").reverse().join("/")}</span>
				<span>pico {fmt(max === 1 && total === 0 ? 0 : max)}/dia</span>
				<span>hoje</span>
			</figcaption>
		</figure>
	);
}

const DEVICE_LABEL: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };

function Breakdown({
	title,
	items,
	labels,
}: {
	title: string;
	items: Bucket[];
	labels?: Record<string, string>;
}): ReactNode {
	const total = items.reduce((sum, i) => sum + i.count, 0);
	return (
		<Panel title={title}>
			{items.length === 0 ? (
				<p className="p-3 text-muted">Sem cliques no período.</p>
			) : (
				<ul className="flex flex-col gap-1.5 p-3">
					{items.map((item) => (
						<li key={item.key} className="relative flex justify-between gap-3 px-1.5 py-0.5">
							<span
								aria-hidden
								className="absolute inset-y-0 left-0 rounded-sm bg-accent/15"
								style={{ width: `${(item.count / total) * 100}%` }}
							/>
							<span className="relative min-w-0 truncate" title={item.key}>
								{labels?.[item.key] ?? item.key}
							</span>
							<span className="relative shrink-0 text-muted">
								{fmt(item.count)} · {Math.round((item.count / total) * 100)}%
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

export function StatsPanels({ stats }: { stats: Stats }): ReactNode {
	return (
		<>
			<Panel title={`Cliques por dia · últimos ${stats.byDay.length} dias`}>
				<DayChart data={stats.byDay} />
			</Panel>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				<Breakdown title="Dispositivo" items={stats.byDevice} labels={DEVICE_LABEL} />
				<Breakdown title="Sistema" items={stats.byOs} />
				<Breakdown title="Navegador" items={stats.byBrowser} />
				<Breakdown title="País" items={stats.byCountry} />
				<div className="min-w-0 md:col-span-2">
					<Breakdown title="Página de origem" items={stats.byReferer} />
				</div>
			</div>
		</>
	);
}

export function ClickMetrics({ stats }: { stats: Stats }): ReactNode {
	const mobile = stats.byDevice.filter((d) => d.key !== "desktop").reduce((sum, d) => sum + d.count, 0);
	const recent = stats.byDevice.reduce((sum, d) => sum + d.count, 0);
	return (
		<>
			<Metric
				label="Cliques"
				value={fmt(stats.clicks + stats.legacyClicks)}
				hint={stats.legacyClicks ? `${fmt(stats.legacyClicks)} herdados da v4` : undefined}
			/>
			<Metric
				label={`Mobile · ${stats.byDay.length} dias`}
				value={recent ? `${Math.round((mobile / recent) * 100)}%` : "—"}
				hint={`${fmt(mobile)} de ${fmt(recent)} cliques`}
			/>
			<Metric label="Bots" value={fmt(stats.botClicks)} hint="fora das contagens" />
			<Metric
				label="Cliques perdidos"
				value={fmt(stats.lostClicks)}
				hint="sem link vivo"
				tone={stats.lostClicks ? "text-bad" : ""}
			/>
		</>
	);
}
