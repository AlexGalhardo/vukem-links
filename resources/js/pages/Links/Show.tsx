import { Head, Link, router, useForm } from "@inertiajs/react";
import { type FormEvent, useState } from "react";

import { ClickMetrics, Panel, StatsPanels, StatusBadge } from "../../components/stats";
import { Button } from "../../components/ui/button";
import { ConfirmDialog, Dialog } from "../../components/ui/dialog";
import { Field, Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { formatDateTime, redirectUrl } from "../../lib/utils";
import type { Page } from "../../page-props";

const RESULT: Record<string, { label: string; tone: string }> = {
  ok: { label: "OK", tone: "text-success" },
  failed: { label: "Falha", tone: "text-destructive" },
  inconclusive: { label: "Inconclusivo", tone: "text-warning" },
};

function EditDialog({
  id,
  url,
  priority,
  open,
  onOpenChange,
}: {
  id: number;
  url: string;
  priority: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm({ url, priority });

  function submit(event: FormEvent) {
    event.preventDefault();
    form.put(`/links/${id}`, { preserveScroll: true, onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Editar link">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="URL de afiliado" error={form.errors.url} hint="Trocar a URL zera o status de saúde.">
          <Input type="url" required value={form.data.url} onChange={(e) => form.setData("url", e.target.value)} />
        </Field>
        <Field label="Ordem (menor = escolhido primeiro)" error={form.errors.priority}>
          <Input
            type="number"
            required
            value={form.data.priority}
            onChange={(e) => form.setData("priority", Number(e.target.value))}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.processing}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function LinkShow({ link, product, project, siblings, checks, stats }: Page<"Links/Show">) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Head title={product.name} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            <Link href={`/projects/${project.slug}`} className="hover:underline">
              {project.name}
            </Link>
            {product.category && ` · ${product.category}`} · {link.store}
          </p>
          <h1 className="truncate text-xl font-semibold">{product.name}</h1>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer nofollow"
            className="block truncate font-mono text-xs hover:underline"
          >
            {link.url}
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(redirectUrl(product.external_id)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? "Copiado" : "Copiar URL de redirect"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.post("/links/check", { ids: [link.id] }, { preserveScroll: true })}
          >
            Checar agora
          </Button>
          <Button
            variant="outline"
            onClick={() => router.post(`/links/${link.id}/promote`, {}, { preserveScroll: true })}
          >
            Tornar principal
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ClickMetrics stats={stats} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Onde está">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge status={link.status} />
              {link.consecutive_failures > 0 && (
                <span className="text-muted-foreground"> · {link.consecutive_failures} falha(s) seguidas</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Projeto</dt>
            <dd>{project.name}</dd>
            <dt className="text-muted-foreground">Página</dt>
            <dd className="min-w-0">
              <a href={product.page_url} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                {product.page_url}
              </a>
            </dd>
            <dt className="text-muted-foreground">ID</dt>
            <dd className="truncate font-mono text-xs">{product.external_id}</dd>
            <dt className="text-muted-foreground">Destino final</dt>
            <dd className="truncate font-mono text-xs">{link.final_url ?? "—"}</dd>
          </dl>
        </Panel>
        <Panel title="Ordem de fallback do produto">
          <ol>
            {siblings.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 border-b px-4 py-2 last:border-0">
                <span className="w-4 text-muted-foreground">{i + 1}</span>
                <Link
                  href={`/links/${s.id}`}
                  aria-current={s.id === link.id ? "page" : undefined}
                  className={`min-w-0 flex-1 truncate font-mono text-xs hover:underline ${s.id === link.id ? "font-semibold" : ""}`}
                >
                  {s.url}
                </Link>
                <span className="text-muted-foreground">{s.store}</span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <StatsPanels stats={stats} />

      <Panel title="Histórico de checagens">
        {checks.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nunca checado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Quando</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Destino final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((c) => {
                const result = RESULT[c.result];
                return (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(c.checked_at)}</TableCell>
                    <TableCell className={result?.tone}>{result?.label ?? c.result}</TableCell>
                    <TableCell>{c.status_code ?? "—"}</TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs">{c.final_url ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <EditDialog
        key={`${link.url}-${link.priority}`}
        id={link.id}
        url={link.url}
        priority={link.priority}
        open={editing}
        onOpenChange={setEditing}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Excluir este link?"
        description="Os cliques registrados deste link também são apagados. Não dá para desfazer."
        confirmLabel="Excluir"
        onConfirm={() => router.delete(`/links/${link.id}`)}
      />
    </>
  );
}
