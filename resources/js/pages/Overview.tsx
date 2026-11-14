import { Head, Link, router } from "@inertiajs/react";
import { useState } from "react";

import { ClickMetrics, Metric, Panel, StatsPanels, StatusBadge } from "../components/stats";
import { Button } from "../components/ui/button";
import { fmt } from "../lib/utils";
import type { LinkRow, Page } from "../page-props";

function LinkList({ links, empty }: { links: LinkRow[]; empty: string }) {
  if (links.length === 0) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul>
      {links.map((l) => (
        <li key={l.id} className="flex items-center gap-3 border-b px-4 py-2 last:border-0">
          <Link href={`/links/${l.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
            {l.product_name}
          </Link>
          <span className="hidden text-muted-foreground sm:inline">{l.project_name}</span>
          <span className="hidden text-muted-foreground sm:inline">{l.store}</span>
          <StatusBadge status={l.status} />
          <span className="w-14 text-right font-medium tabular-nums">{fmt(l.clicks)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Overview({ stats, links, dead, unchecked, dead_links, top_links }: Page<"Overview">) {
  const [checking, setChecking] = useState(false);

  return (
    <>
      <Head title="Visão geral" />
      <h1 className="text-xl font-semibold">Visão geral</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Links" value={fmt(links)} hint={`${fmt(unchecked)} não checados`} />
        <Metric label="Links mortos" value={fmt(dead)} tone={dead ? "text-destructive" : "text-success"} />
        <ClickMetrics stats={stats} />
      </div>
      <StatsPanels stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Links mortos">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={checking || links === 0}
              onClick={() =>
                router.post(
                  "/links/check",
                  { all: true },
                  {
                    preserveScroll: true,
                    onStart: () => setChecking(true),
                    onFinish: () => setChecking(false),
                  },
                )
              }
            >
              {checking ? "Checando…" : "Checar todos os links"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {checking
                ? "Pode levar alguns minutos. Mantenha a página aberta."
                : "Um link vira morto após 3 falhas seguidas."}
            </span>
          </div>
          <LinkList links={dead_links} empty="Nenhum link morto." />
        </Panel>
        <Panel title="Mais clicados">
          <LinkList links={top_links} empty="Nenhum link cadastrado." />
        </Panel>
      </div>
    </>
  );
}
