import type { ReactNode } from "react";
import { cn, fmt } from "../lib/utils";
import type { Bucket, Stats } from "../page-props";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const STATUS: Record<string, { label: string; variant: "success" | "destructive" | "secondary" }> = {
  alive: { label: "Vivo", variant: "success" },
  dead: { label: "Morto", variant: "destructive" },
  unknown: { label: "Não checado", variant: "secondary" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}

// ClickMetrics are the click numbers of a scope: human clicks (last 30 days of detail), bots and clicks without a link.
export function ClickMetrics({ stats }: { stats: Stats }) {
  const total = stats.clicks + stats.legacy_clicks;
  const mobile = stats.by_device.filter((d) => d.key !== "desktop").reduce((sum, d) => sum + d.count, 0);
  const detailed = stats.by_device.reduce((sum, d) => sum + d.count, 0);
  return (
    <>
      <Metric
        label="Cliques"
        value={fmt(total)}
        hint={stats.legacy_clicks ? `${fmt(stats.legacy_clicks)} antes do detalhe por clique` : "todo o período"}
      />
      <Metric
        label="Mobile (30 dias)"
        value={detailed ? `${Math.round((mobile / detailed) * 100)}%` : "—"}
        hint={`${fmt(mobile)} de ${fmt(detailed)}`}
      />
      <Metric label="Bots" value={fmt(stats.bot_clicks)} hint="não contam nos cliques" />
      <Metric
        label="Sem link vivo"
        value={fmt(stats.lost_clicks)}
        hint="voltaram para a página"
        tone={stats.lost_clicks ? "text-destructive" : undefined}
      />
    </>
  );
}

function DayChart({ days }: { days: Bucket[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div
      role="img"
      aria-label={`Cliques por dia nos últimos ${days.length} dias`}
      className="flex h-32 items-end gap-0.5 p-4"
    >
      {days.map((d) => (
        <div
          key={d.key}
          title={`${d.key}: ${d.count}`}
          className="min-h-px flex-1 rounded-t-sm bg-primary/80"
          style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: Bucket[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <ul className="grid gap-1.5 p-4">
          {items.map((item) => (
            <li key={item.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
              <span className="truncate" title={item.key}>
                {item.key}
              </span>
              <span className="tabular-nums">{fmt(item.count)}</span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full bg-primary/70" style={{ width: `${(item.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function StatsPanels({ stats }: { stats: Stats }) {
  return (
    <>
      <Panel title={`Cliques por dia (${stats.by_day.length} dias)`}>
        <DayChart days={stats.by_day} />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="Dispositivo" items={stats.by_device} />
        <Breakdown title="Sistema" items={stats.by_os} />
        <Breakdown title="Navegador" items={stats.by_browser} />
        <Breakdown title="País" items={stats.by_country} />
        <Breakdown title="Origem (página)" items={stats.by_referer} />
      </div>
    </>
  );
}
